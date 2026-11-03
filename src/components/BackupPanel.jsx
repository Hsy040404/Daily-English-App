import { useRef, useState } from "react";
import {
  ArchiveRestore,
  CheckCircle2,
  Download,
  HardDriveDownload,
  ShieldCheck
} from "lucide-react";
import { createDailyBackup, backupToJson, exportDatabaseSnapshot, restoreDatabaseSnapshot } from "../utils/backup";

export default function BackupPanel({ latestBackup, today, refresh, showToast }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  async function backupNow() {
    setBusy(true);
    try {
      await createDailyBackup();
      await refresh();
      showToast("今天的本地快照已更新");
    } catch (error) {
      showToast(`备份失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function downloadBackup() {
    setBusy(true);
    try {
      const snapshot = await exportDatabaseSnapshot();
      const blob = new Blob([backupToJson(snapshot)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `每日英语备份_${today}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast("完整备份文件已下载");
    } catch (error) {
      showToast(`下载备份失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!window.confirm("恢复备份会覆盖当前学习数据，确定继续吗？")) return;
    setBusy(true);
    try {
      await restoreDatabaseSnapshot(await file.text());
      showToast("备份已恢复，正在重新载入");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      showToast(`恢复失败：${error.message}`, "error");
      setBusy(false);
    }
  }

  return (
    <section className="backup-panel panel">
      <div className="backup-panel__copy">
        <span className="backup-panel__icon"><ShieldCheck size={21} /></span>
        <div>
          <span className="eyebrow">LOCAL BACKUP</span>
          <h2>每日自动备份</h2>
          <p>
            数据变化后更新今天的本地快照，并保留最近 14 天。也可以下载完整 JSON 备份保存到其他位置。
          </p>
        </div>
      </div>
      <div className="backup-panel__status">
        <CheckCircle2 size={17} />
        <div>
          <strong>{latestBackup ? "今天已自动备份" : "自动备份准备中"}</strong>
          <span>
            {latestBackup
              ? new Date(latestBackup.updatedAt).toLocaleString("zh-CN")
              : "打开应用后自动创建"}
          </span>
        </div>
      </div>
      <div className="backup-panel__actions">
        <input
          ref={input}
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          aria-label="选择备份文件"
          onChange={restoreBackup}
        />
        <button className="text-button" onClick={backupNow} disabled={busy}>
          <HardDriveDownload size={15} /> 立即备份
        </button>
        <button className="secondary-button" onClick={downloadBackup} disabled={busy}>
          <Download size={16} /> 下载完整备份
        </button>
        <button className="secondary-button" onClick={() => input.current?.click()} disabled={busy}>
          <ArchiveRestore size={16} /> 恢复备份
        </button>
      </div>
    </section>
  );
}
