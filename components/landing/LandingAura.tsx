export function LandingMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 42 16" fill="none" aria-hidden="true">
      <path d="M6 8h30" />
      <circle cx="6" cy="8" r="2.15" />
      <circle cx="21" cy="8" r="2.7" />
      <circle cx="36" cy="8" r="2.15" />
    </svg>
  )
}

export default function LandingAura() {
  return (
    <div className="landing-aura" aria-hidden="true">
      <div className="landing-aura-glow landing-aura-glow-a" />
      <div className="landing-aura-glow landing-aura-glow-b" />
      <div className="landing-aura-glow landing-aura-glow-c" />
      <svg className="landing-aura-net" viewBox="0 0 1440 1100" preserveAspectRatio="xMidYMin slice">
        <g className="landing-aura-links">
          <path d="M118 210 246 168 318 248 412 198" />
          <path d="M246 168 290 92" />
          <path d="M80 320 118 210 70 140" />
          <path d="M980 118 1088 168 1186 128 1294 196 1210 268 1088 168" />
          <path d="M1186 128 1248 64" />
          <path d="M1088 168 1024 248 1122 322 1210 268" />
          <path d="M1024 248 940 292" />
          <path d="M1122 322 1060 410 1168 468 1240 392 1210 268" />
          <path d="M180 720 268 676 340 748 268 820 180 776 180 720" />
          <path d="M340 748 430 710 520 760" />
          <path d="M1168 468 1248 540 1320 500" />
          <path d="M880 90 980 118 920 200" />
        </g>
        <g className="landing-aura-nodes">
          <circle cx="118" cy="210" r="2.2" />
          <circle cx="246" cy="168" r="2.6" />
          <circle className="landing-node-live" cx="290" cy="92" r="3.1" />
          <circle cx="318" cy="248" r="2.2" />
          <circle cx="412" cy="198" r="2.4" />
          <circle cx="980" cy="118" r="2.2" />
          <circle className="landing-node-live" cx="1088" cy="168" r="3.4" />
          <circle cx="1186" cy="128" r="2.4" />
          <circle cx="1248" cy="64" r="2.1" />
          <circle cx="1294" cy="196" r="2.3" />
          <circle cx="1210" cy="268" r="2.6" />
          <circle cx="1024" cy="248" r="2.3" />
          <circle cx="940" cy="292" r="2.1" />
          <circle className="landing-node-live" cx="1122" cy="322" r="3" />
          <circle cx="1060" cy="410" r="2.2" />
          <circle cx="1168" cy="468" r="2.5" />
          <circle cx="1240" cy="392" r="2.2" />
          <circle cx="1248" cy="540" r="2.1" />
          <circle cx="180" cy="720" r="2.1" />
          <circle cx="268" cy="676" r="2.4" />
          <circle className="landing-node-live" cx="340" cy="748" r="3" />
          <circle cx="268" cy="820" r="2.2" />
          <circle cx="180" cy="776" r="2.1" />
          <circle cx="430" cy="710" r="2.2" />
        </g>
      </svg>
      <div className="landing-aura-grain" />
    </div>
  )
}
