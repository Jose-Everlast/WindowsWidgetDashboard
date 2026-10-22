import { describe, expect, it } from "vitest";
import { cpuPercent, formatClock, formatUptime, sumCpuTimes } from "./parse";

const cpu = (user: number, idle: number) => ({ times: { user, nice: 0, sys: 0, idle, irq: 0 } });

describe("core parse", () => {
  it("computes the load between two samples", () => {
    const a = sumCpuTimes([cpu(100, 900), cpu(100, 900)]);
    const b = sumCpuTimes([cpu(150, 950), cpu(200, 900)]);
    expect(cpuPercent(undefined, a)).toBeNull();
    // 150 busy of 200 total
    expect(cpuPercent(a, b)).toBe(75);
    expect(cpuPercent(b, b)).toBeNull();
  });

  it("formats the clock and the uptime", () => {
    expect(formatClock(new Date(2026, 9, 19, 7, 5, 9))).toEqual({ time: "07:05:09", date: "MO 19.10.2026" });
    expect(formatUptime(456_720)).toBe("5 T 6 h");
    expect(formatUptime(3_900)).toBe("1 h 5 min");
  });
});
