import { useState, useEffect } from "react";

function TempoIndicator({ tempo }) {
  const [animationStyle, setAnimationStyle] = useState({});
  useEffect(() => {
    let bpm = 0;
    if (tempo && typeof tempo === "string") {
      const parsedBpm = parseInt(tempo.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(parsedBpm) && parsedBpm > 0) {
        bpm = parsedBpm;
      }
    }
    if (bpm > 0) {
      const duration = 60 / bpm;
      setAnimationStyle({
        animationName: "led-flash",
        animationDuration: `${duration}s`,
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
      });
    } else {
      setAnimationStyle({});
    }
  }, [tempo]);

  if (!tempo || parseInt(tempo.replace(/[^0-9]/g, ""), 10) <= 0) return null;

  return (
    <div className="flex items-center gap-3">
      <style>
        {`
                    @keyframes led-flash {
                        0% { background-color: rgb(224 242 254); box-shadow: 0 0 12px 4px rgba(56, 189, 248, 0.8); transform: scale(1.3); }
                        15% { background-color: rgb(12 74 110); box-shadow: none; transform: scale(1); }
                        100% { background-color: rgb(12 74 110); box-shadow: none; transform: scale(1); }
                    }
                `}
      </style>
      <div className="relative flex items-center justify-center">
        <div
          style={animationStyle}
          className="w-5 h-5 bg-sky-900 rounded-full border border-sky-800"
        ></div>
      </div>
      <span className="text-gray-400 text-lg font-mono">{tempo}</span>
    </div>
  );
}

export default TempoIndicator;
