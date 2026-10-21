import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { CosmicBackground } from "../components/CosmicBackground";
import { ONBOARDING_SLIDES } from "../data/onboarding";
import "./onboarding.css";

interface Props {
  onFinish: () => void;
  initialIndex?: number;
}

const SWIPE_THRESHOLD = 56;

export function Onboarding({ onFinish, initialIndex = 0 }: Props) {
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), ONBOARDING_SLIDES.length - 1),
  );
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const startX = useRef<number | null>(null);

  const total = ONBOARDING_SLIDES.length;
  const slide = ONBOARDING_SLIDES[index];
  const isLast = index === total - 1;
  const Icon = slide.icon;

  const goNext = useCallback(() => {
    if (index === total - 1) {
      onFinish();
      return;
    }
    setDirection("next");
    setIndex((value) => value + 1);
  }, [index, total, onFinish]);

  const goPrev = useCallback(() => {
    if (index === 0) return;
    setDirection("prev");
    setIndex((value) => value - 1);
  }, [index]);

  const goTo = (target: number) => {
    setDirection(target > index ? "next" : "prev");
    setIndex(target);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "Enter") goNext();
      else if (event.key === "ArrowLeft") goPrev();
      else if (event.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, onFinish]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startX.current = event.clientX;
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    const delta = event.clientX - startX.current;
    startX.current = null;

    if (delta <= -SWIPE_THRESHOLD) goNext();
    else if (delta >= SWIPE_THRESHOLD) goPrev();
  };

  return (
    <div
      className="ob"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      aria-label="F App introduction"
    >
      <CosmicBackground />

      <div className="ob__shell">
        <div className="ob__art">
          <div className={`ob__panel ob__panel--${slide.tone}`}>
            <span className="ob__ring ob__ring--outer" aria-hidden="true" />
            <span className="ob__ring ob__ring--inner" aria-hidden="true" />

            <div className="ob__glyph" key={slide.id}>
              <Icon size={104} strokeWidth={1.1} />
            </div>

            <ul className="ob__chips">
              {slide.chips.map((chip) => {
                const ChipIcon = chip.icon;
                return (
                  <li className="ob__chip" key={chip.label}>
                    <ChipIcon size={15} strokeWidth={1.9} />
                    <span>{chip.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="ob__content">
          <div className={`ob__text ob__text--${direction}`} key={slide.id} aria-live="polite">
            <h1>{slide.title}</h1>
            <p>{slide.body}</p>
          </div>

          <div className="ob__controls">
            <button className="ob__skip" onClick={onFinish}>
              Skip
            </button>

            <div className="ob__dots" role="tablist" aria-label="Slides">
              {ONBOARDING_SLIDES.map((item, dotIndex) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={dotIndex === index}
                  aria-label={`Slide ${dotIndex + 1}`}
                  className={`ob__dot${dotIndex === index ? " is-active" : ""}`}
                  onClick={() => goTo(dotIndex)}
                />
              ))}
            </div>

            <button
              className="ob__next"
              onClick={goNext}
              aria-label={isLast ? "Finish introduction" : "Next slide"}
            >
              {isLast ? <Check size={24} strokeWidth={2.4} /> : <ArrowRight size={24} strokeWidth={2.2} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
