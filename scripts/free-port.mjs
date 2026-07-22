// dev サーバ起動前に指定ポート (既定 5180) の LISTEN プロセスを強制終了する。
// 5180 が塞がると vite が 5181 に逃げ、OAuth redirect URI / Picker API キーの
// referrer (localhost:5180 固定) と食い違って Drive 連携が壊れるため。
// クロスプラットフォーム (win32: netstat+taskkill / posix: lsof+kill)。best-effort。
import { execSync } from "node:child_process";

const port = process.argv[2] ?? "5180";

function killPids(pids) {
  for (const pid of pids) {
    try {
      if (process.platform === "win32") execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      else execSync(`kill -9 ${pid}`, { stdio: "ignore" });
      console.log(`[free-port] freed :${port} (killed PID ${pid})`);
    } catch {
      /* 既に終了済み等は無視 */
    }
  }
}

try {
  if (process.platform === "win32") {
    // `-p tcp` は IPv4 のみに絞られ、node/vite の IPv6 リッスン ([::1]:5180) を取りこぼす。
    // 素の `netstat -ano` で TCP/TCPv6 両方を対象にする。
    const out = execSync("netstat -ano", { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split("\n")) {
      // 例: "  TCP    [::1]:5180    [::]:0    LISTENING    31468"
      if (line.includes(`:${port} `) && /LISTENING/i.test(line)) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
    }
    killPids(pids);
  } else {
    let pids = [];
    try {
      pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: "utf8" })
        .split("\n")
        .filter(Boolean);
    } catch {
      /* lsof は該当なしで非0終了する */
    }
    killPids(pids);
  }
} catch {
  /* ポート解放は best-effort。失敗しても起動は続行 */
}
