import { useEffect, useRef, useState } from "react";
import {
  Clock3,
  FileText,
  FileUp,
  Lightbulb,
  Mic2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Square,
  Trash2
} from "lucide-react";
import { db, deleteImportedMaterial, saveImportedMaterial } from "../db";
import { speakingPrompts } from "../data/content";
import { dayOfYear, localDateKey } from "../utils/date";
import { PageHeading } from "../components/ui";

function formatDuration(seconds = 0) {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export default function Speaking({ data, refresh, showToast }) {
  const promptIndex = (dayOfYear() - 1) % speakingPrompts.length;
  const prompt = speakingPrompts[promptIndex];
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [note, setNote] = useState(data.todaySpeaking?.note || "");
  const [rating, setRating] = useState(data.todaySpeaking?.rating || 0);
  const [audioUrl, setAudioUrl] = useState("");
  const [activeMaterialId, setActiveMaterialId] = useState(null);
  const [importing, setImporting] = useState(false);
  const recorder = useRef(null);
  const stream = useRef(null);
  const chunks = useRef([]);
  const startedAt = useRef(0);
  const timer = useRef(null);
  const fileInput = useRef(null);
  const speakingMaterials = data.materials.filter(
    (material) => material.module === "speaking"
  );
  const activeMaterial = speakingMaterials.find(
    (material) => material.id === activeMaterialId
  );

  useEffect(() => {
    setNote(data.todaySpeaking?.note || "");
    setRating(data.todaySpeaking?.rating || 0);
    setElapsed(Math.round(data.todaySpeaking?.duration || 0));
  }, [data.todaySpeaking?.createdAt, data.todaySpeaking?.updatedAt]);

  useEffect(() => {
    if (!data.todaySpeaking?.blob) {
      setAudioUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(data.todaySpeaking.blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data.todaySpeaking?.blob]);

  useEffect(
    () => () => {
      window.clearInterval(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("当前浏览器不支持录音，请使用最新版 Edge 或 Chrome。");
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = mediaStream;
      chunks.current = [];
      const mediaRecorder = new MediaRecorder(mediaStream);
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks.current, {
          type: mediaRecorder.mimeType || "audio/webm"
        });
        const duration = Math.max(1, (Date.now() - startedAt.current) / 1000);
        const previous = await db.speaking.get(localDateKey());
        await db.speaking.put({
          ...previous,
          date: localDateKey(),
          blob,
          duration,
          note,
          rating,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        setRecording(false);
        window.clearInterval(timer.current);
        await refresh();
        showToast("录音已保存到这台电脑");
      };
      mediaRecorder.start(250);
      startedAt.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timer.current = window.setInterval(() => {
        setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      }, 500);
    } catch (recordError) {
      console.error(recordError);
      setError("无法使用麦克风。请在浏览器地址栏旁允许本站访问麦克风后重试。");
    }
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
    }
  }

  async function saveReflection() {
    const date = localDateKey();
    const previous = await db.speaking.get(date);
    await db.speaking.put({
      ...previous,
      date,
      note,
      rating,
      duration: previous?.duration || 0,
      updatedAt: new Date().toISOString()
    });
    await refresh({ light: true });
    showToast("口语练习记录已保存");
  }

  async function setSelfRating(value) {
    setRating(value);
    const date = localDateKey();
    const previous = await db.speaking.get(date);
    await db.speaking.put({
      ...previous,
      date,
      rating: value,
      duration: previous?.duration || 0,
      updatedAt: new Date().toISOString()
    });
    await refresh({ light: true });
  }

  async function deleteRecording() {
    if (!window.confirm("确定删除今天的口语录音吗？笔记和自我评分也会一起删除。")) {
      return;
    }
    await db.speaking.delete(localDateKey());
    setElapsed(0);
    await refresh();
    showToast("今天的口语记录已删除");
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const { extractPlainTextFromFile } = await import("../utils/importWords");
      const extracted = await extractPlainTextFromFile(file);
      const id = await saveImportedMaterial({
        module: "speaking",
        fileName: file.name,
        format: extracted.format,
        text: extracted.text
      });
      await refresh();
      setActiveMaterialId(id);
      showToast(`口语素材“${file.name}”已导入`);
    } catch (error) {
      console.error(error);
      showToast(`导入口语素材失败：${error.message}`, "error");
    } finally {
      setImporting(false);
    }
  }

  async function removeMaterial(material) {
    if (!window.confirm(`确定删除口语素材“${material.fileName}”吗？`)) return;
    await deleteImportedMaterial(material.id);
    if (activeMaterialId === material.id) setActiveMaterialId(null);
    await refresh();
    showToast(`口语素材“${material.fileName}”已删除`);
  }

  return (
    <div className="page speaking-page">
      <PageHeading
        eyebrow="SPEAKING"
        title="口语练习"
        description="给自己一个明确的问题、一段完整的回答，再回听一个值得改进的细节。"
        actions={
          <>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              aria-label="导入口语文件"
              onChange={handleImport}
            />
            <button
              className="secondary-button"
              onClick={() => fileInput.current?.click()}
              disabled={importing}
            >
              <FileUp size={17} /> {importing ? "正在导入" : "导入 Word / PDF"}
            </button>
          </>
        }
      />

      <section className="material-strip panel">
        <div>
          <span className="eyebrow">SPEAKING SOURCES</span>
          <strong>口语素材</strong>
        </div>
        <div className="material-strip__list">
          <button
            className={!activeMaterial ? "is-active" : ""}
            onClick={() => setActiveMaterialId(null)}
          >
            每日话题
          </button>
          {speakingMaterials.map((material) => (
            <div
              key={material.id}
              className={`material-item ${
                activeMaterialId === material.id ? "is-active" : ""
              }`}
            >
              <button
                className="material-select"
                onClick={() => setActiveMaterialId(material.id)}
                title={material.fileName}
              >
                <FileText size={14} />
                <span>{material.fileName}</span>
                <small className="material-format">
                  {material.format} · {new Date(material.importedAt).toLocaleDateString("zh-CN")}
                </small>
              </button>
              <button
                className="material-delete"
                onClick={() => removeMaterial(material)}
                aria-label={`删除口语素材 ${material.fileName}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="speaking-layout">
        <section className="speaking-prompt panel">
          <div className="prompt-number">
            {activeMaterial ? "DOC" : String(promptIndex + 1).padStart(2, "0")}
          </div>
          <span className="eyebrow">
            {activeMaterial ? "IMPORTED MATERIAL" : "TODAY'S TOPIC"}
          </span>
          <h2>{activeMaterial ? activeMaterial.fileName : prompt.title}</h2>
          <p
            className={`speaking-question ${
              activeMaterial ? "speaking-question--imported" : ""
            }`}
          >
            {activeMaterial ? activeMaterial.text : prompt.prompt}
          </p>
          <div className="prompt-tips">
            {prompt.tips.map((tip, tipIndex) => (
              <div key={tip}>
                <span>{tipIndex + 1}</span>
                <p>{tip}</p>
              </div>
            ))}
          </div>
          <div className="prompt-tip-note">
            <Lightbulb size={17} />
            先连续说满 60 秒，再考虑语法是否完美。
          </div>
        </section>

        <section className="recording-panel panel">
          <div className="recording-top">
            <div>
              <span className="eyebrow">VOICE NOTE</span>
              <h2>{recording ? "正在录音" : "录下你的回答"}</h2>
            </div>
            <div className={`recording-status ${recording ? "is-live" : ""}`}>
              <span />
              {recording ? "REC" : "READY"}
            </div>
          </div>

          <div className={`recording-stage ${recording ? "is-recording" : ""}`}>
            <div className="sound-bars" aria-hidden="true">
              {Array.from({ length: 21 }, (_, index) => (
                <span key={index} style={{ "--bar-index": index }} />
              ))}
            </div>
            <strong>{formatDuration(elapsed)}</strong>
            <span>{recording ? "保持自然语速，不要停下来重录" : "建议 60 至 90 秒"}</span>
          </div>

          <div className="recording-actions">
            {recording ? (
              <button className="record-button is-stop" onClick={stopRecording}>
                <Square size={21} fill="currentColor" /> 停止并保存
              </button>
            ) : (
              <button className="record-button" onClick={startRecording}>
                <Mic2 size={22} /> {data.todaySpeaking?.blob ? "重新录音" : "开始录音"}
              </button>
            )}
            {data.todaySpeaking?.blob ? (
              <button className="icon-button icon-button--danger" onClick={deleteRecording}>
                <Trash2 size={18} />
              </button>
            ) : null}
          </div>

          {error ? <p className="inline-error-text">{error}</p> : null}

          {audioUrl ? (
            <div className="playback-card">
              <div>
                <Play size={17} />
                <span>今天的录音</span>
              </div>
              <audio controls src={audioUrl} preload="metadata" />
            </div>
          ) : (
            <div className="playback-placeholder">
              <Pause size={17} />
              <span>完成录音后可以在这里回放</span>
            </div>
          )}
        </section>
      </div>

      <section className="reflection-panel panel">
        <div className="reflection-heading">
          <div>
            <span className="eyebrow">REFLECTION</span>
            <h2>回听之后</h2>
            <p>只记录一个真正想改进的地方，下一次练习会更有方向。</p>
          </div>
          <Clock3 size={26} />
        </div>
        <div className="rating-block">
          <span>今天说得怎么样？</span>
          <div className="rating-buttons">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                className={rating === value ? "is-selected" : ""}
                onClick={() => setSelfRating(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <label className="reflection-note">
          <span>练习笔记</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：表达观点时停顿太多；下次先写三个关键词，再开始录音。"
          />
        </label>
        <div className="reflection-footer">
          <span>
            <RotateCcw size={15} />
            录音和文字只保存在本机
          </span>
          <button className="secondary-button" onClick={saveReflection}>
            <Save size={17} /> 保存练习记录
          </button>
        </div>
      </section>
    </div>
  );
}
