import { writeSync } from 'node:fs';

process.once('exit', () => {
  const { userCPUTime, systemCPUTime, maxRSS } = process.resourceUsage();
  const { active, idle, utilization } = performance.eventLoopUtilization();
  writeSync(
    1,
    JSON.stringify({
      event: 'bench.process',
      userCpuMs: userCPUTime / 1000,
      systemCpuMs: systemCPUTime / 1000,
      maxRssKiB: maxRSS,
      eventLoopActiveMs: active,
      eventLoopIdleMs: idle,
      eventLoopUtilization: utilization,
    }) + '\n',
  );
});
