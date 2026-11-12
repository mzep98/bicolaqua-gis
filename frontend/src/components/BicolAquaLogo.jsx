import React from 'react';

export default function BicolAquaLogo({ className = 'w-9 h-9' }) {
  return (
    <svg
      viewBox="0 0 200 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="BicolAqua 3D GIS Logo"
    >
      <defs>
        <clipPath id="bicolaqua-droplet-clip">
          <path d="M100 10C100 10 24 94 24 142C24 183.974 58.0264 214 100 214C141.974 214 176 183.974 176 142C176 94 100 10 100 10Z" />
        </clipPath>
      </defs>

      {/* Main Droplet Container */}
      <g clipPath="url(#bicolaqua-droplet-clip)">
        {/* Upper Baltic Blue Background */}
        <rect x="0" y="0" width="200" height="220" fill="#01658E" />

        {/* Pacific Blue Topographic Contour Swirls */}
        <path
          d="M18 82C46 84 68 62 76 34M16 108C56 112 88 82 98 28M22 132C64 132 104 98 116 42M128 58C122 86 138 106 178 104M142 84C144 104 160 118 184 118"
          stroke="#00B3CD"
          strokeWidth="4.5"
          strokeLinecap="round"
          opacity="0.72"
        />

        {/* White Mountain Snowcap / Ridge Highlight */}
        <path
          d="M16 154L74 114C81 109 89 109 96 114L104 118C110 115 117 116 122 121L184 156L184 176L16 176Z"
          fill="#FDFDFD"
        />

        {/* Yale Blue Volcanic Massif (Mt. Isarog) */}
        <path
          d="M14 162L82 124C88 121 95 121 101 125L108 123C113 121 119 123 123 127L186 164L186 182L14 182Z"
          fill="#033F56"
        />

        {/* Atomic Tangerine & Tangerine Dream Volcanic Ridge Accents */}
        <path
          d="M80 144L93 129C96 126 100 126 102 130L109 145L102 146L97 135L86 147Z"
          fill="#FD7132"
        />
        <path
          d="M115 137L136 153L131 156L113 141Z"
          fill="#FE9659"
        />

        {/* White Wave Separator */}
        <path
          d="M14 166C52 150 86 156 116 168C142 178 166 174 186 162L186 220L14 220Z"
          fill="#FDFDFD"
        />

        {/* Electric Aqua Upper Wave */}
        <path
          d="M14 174C52 158 84 164 114 176C140 186 166 182 186 170L186 220L14 220Z"
          fill="#91EFF7"
        />

        {/* Strong Cyan Mid Wave */}
        <path
          d="M14 190C54 184 86 192 118 186C146 180 168 174 186 170L186 220L14 220Z"
          fill="#2ED5E5"
        />

        {/* Pacific Blue Deep Base Wave */}
        <path
          d="M14 202C60 198 112 200 186 196L186 220L14 220Z"
          fill="#00B3CD"
        />
      </g>

      {/* White Cutout Halo Behind Location Pin */}
      <path
        d="M137 56C117.67 56 102 71.67 102 91C102 114.5 137 146 137 146C137 146 172 114.5 172 91C172 71.67 156.33 56 137 56Z"
        fill="#FDFDFD"
      />

      {/* Atomic Tangerine Location Pin */}
      <path
        d="M137 62C120.984 62 108 74.9837 108 91C108 110.8 137 138 137 138C137 138 166 110.8 166 91C166 74.9837 153.016 62 137 62Z"
        fill="#FD7132"
      />

      {/* Tangerine Dream Pin Highlight Arc */}
      <path
        d="M116 88C116 76.5 125.2 67.5 136.5 67.5"
        stroke="#FE9659"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Crisp White Center Pin Dot */}
      <circle cx="137" cy="90" r="11" fill="#FDFDFD" />
    </svg>
  );
}