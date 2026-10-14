import qrcode from "qrcode-generator";
import React, { useMemo } from "react";
import { View } from "react-native";
import { dp } from "../theme";

/**
 * A QR code drawn with plain Views, so it needs no SVG or image library on
 * the TV. Each row is one View of runs of dark modules.
 */
export function QrCode({ value, size = 360 }: { value: string; size?: number }) {
  const rows = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const out: { start: number; length: number }[][] = [];
    for (let r = 0; r < n; r++) {
      const runs: { start: number; length: number }[] = [];
      let c = 0;
      while (c < n) {
        if (!qr.isDark(r, c)) {
          c++;
          continue;
        }
        const start = c;
        while (c < n && qr.isDark(r, c)) c++;
        runs.push({ start, length: c - start });
      }
      out.push(runs);
    }
    return { n, out };
  }, [value]);

  const quiet = 4; // modules of white border the spec asks for
  const cell = Math.max(1, Math.floor(dp(size) / (rows.n + quiet * 2)));
  const inner = cell * rows.n;
  return (
    <View style={{ width: inner + cell * quiet * 2, padding: cell * quiet, backgroundColor: "#FFFFFF", borderRadius: dp(16) }}>
      {rows.out.map((runs, r) => (
        <View key={r} style={{ height: cell, width: inner }}>
          {runs.map((run) => (
            <View
              key={run.start}
              style={{
                position: "absolute",
                left: run.start * cell,
                width: run.length * cell,
                height: cell,
                backgroundColor: "#0B0F17",
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
