"use client";

type FlightLevel =
  | "elevate"
  | "ascend"
  | "air"
  | "select";

type Props = {
  level: FlightLevel;
  showName?: boolean;
  showDescriptor?: boolean;
  size?: "sm" | "md" | "lg";
};

const LEVELS = {
  elevate: {
    name: "[ELEVATE]",
    descriptor: "DEVELOP TO PLAY",
    color: "#E5A719",
  },

  ascend: {
    name: "[ASCEND]",
    descriptor: "PLAY TO COMPETE",
    color: "#7C2DC4",
  },

  air: {
    name: "[AIR]",
    descriptor: "COMPETE TO DOMINATE",
    color: "#00B9D2",
  },

  select: {
    name: "[SELECT]",
    descriptor: "COMPETE BEYOND",
    color: "#FFFFFF",
  },
} as const;

export default function FlightLevelMark({
  level,
  showName = true,
  showDescriptor = false,
  size = "md",
}: Props) {
  const config = LEVELS[level];

  const dimensions = {
    sm: 28,
    md: 38,
    lg: 52,
  };

  const iconSize = dimensions[size];

  return (
    <div className={`flightLevel flightLevel-${size}`}>
      <div
        className="flightLevelIcon"
        style={{
          width: iconSize,
          height: iconSize,
          color: config.color,
        }}
      >
        {level === "elevate" && (
          <svg
            viewBox="0 0 64 64"
            width="100%"
            height="100%"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9 47C21 49 34 44 42 35C47 29 50 23 52 17"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
            />

            <path
              d="M40 17L55 11L58 27"
              fill="currentColor"
            />
          </svg>
        )}

        {level === "ascend" && (
          <svg
            viewBox="0 0 64 64"
            width="100%"
            height="100%"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 36L32 20L52 36V48L32 32L12 48V36Z"
              fill="currentColor"
            />

            <path
              d="M12 20L32 4L52 20V32L32 16L12 32V20Z"
              fill="currentColor"
            />
          </svg>
        )}

        {level === "air" && (
          <svg
            viewBox="0 0 64 64"
            width="100%"
            height="100%"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 27L59 6L43 57L30 39L18 49L21 34L5 27Z"
              fill="currentColor"
            />

            <path
              d="M21 34L47 17L30 39"
              stroke="#000000"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity=".55"
            />
          </svg>
        )}

        {level === "select" && (
          <svg
            viewBox="0 0 64 64"
            width="100%"
            height="100%"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M32 5L39.5 22.5L58 24L44 36L48.5 55L32 45L15.5 55L20 36L6 24L24.5 22.5L32 5Z"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {showName && (
        <div
          className="flightLevelName"
          style={{ color: config.color }}
        >
          {config.name}
        </div>
      )}

      {showDescriptor && (
        <div className="flightLevelDescriptor">
          {config.descriptor}
        </div>
      )}

      <style>{`
        .flightLevel {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .flightLevelIcon {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
        }

        .flightLevelName {
          margin-top: 5px;
          font-weight: 950;
          line-height: 1;
          white-space: nowrap;
          letter-spacing: 0.025em;
        }

        .flightLevelDescriptor {
          margin-top: 5px;
          color: #ffffff;
          font-weight: 700;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }

        .flightLevel-sm .flightLevelName {
          font-size: 10px;
        }

        .flightLevel-md .flightLevelName {
          font-size: 12px;
        }

        .flightLevel-lg .flightLevelName {
          font-size: 15px;
        }

        .flightLevel-sm .flightLevelDescriptor {
          font-size: 7px;
        }

        .flightLevel-md .flightLevelDescriptor {
          font-size: 9px;
        }

        .flightLevel-lg .flightLevelDescriptor {
          font-size: 11px;
        }
      `}</style>
    </div>
  );
}
