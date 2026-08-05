/** Applies pointer, idle, and reduced-motion transforms to the gift-card scene. */

type CardPivot = {
  rotation: { x: number; y: number; z: number };
};

/** Own pointer tracking, visibility gating, and the damped animation frame loop. */
export function startGiftCardMotion(
  host: HTMLElement,
  pivot: CardPivot,
  render: () => void,
): () => void {
  const maxTilt = 0.21;
  let targetX = -0.045;
  let targetY = 0.07;
  let currentX = targetX;
  let currentY = targetY;
  let velocityX = 0;
  let velocityY = 0;
  let pointerActive = false;

  const rest = () => {
    pointerActive = false;
    targetX = -0.045;
    targetY = 0.07;
  };

  const onPointerMove = (event: PointerEvent) => {
    const bounds = host.getBoundingClientRect();
    const normalizedX =
      (event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width * 0.85);
    const normalizedY =
      (event.clientY - (bounds.top + bounds.height / 2)) / (bounds.height * 0.95);
    if (Math.abs(normalizedX) > 1.6 || Math.abs(normalizedY) > 1.9) {
      rest();
      return;
    }
    pointerActive = true;
    targetY = Math.max(-1, Math.min(1, normalizedX)) * maxTilt;
    targetX = Math.max(-1, Math.min(1, normalizedY)) * maxTilt * 0.72;
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("blur", rest);
  host.addEventListener("pointerleave", rest);

  let visible = true;
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  visibilityObserver.observe(host);

  let animationFrame = 0;
  let last = performance.now();
  const startedAt = last;
  const frame = (now: number) => {
    animationFrame = requestAnimationFrame(frame);
    const delta = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (!visible || document.hidden) return;

    const elapsed = (now - startedAt) / 1000;
    const driftY = pointerActive ? 0 : Math.sin(elapsed * 0.34) * 0.018;
    const driftX = pointerActive ? 0 : Math.cos(elapsed * 0.23) * 0.012;
    const stiffness = 46;
    const damping = 2 * Math.sqrt(stiffness);
    velocityX +=
      (-(currentX - (targetX + driftX)) * stiffness - velocityX * damping) * delta;
    velocityY +=
      (-(currentY - (targetY + driftY)) * stiffness - velocityY * damping) * delta;
    currentX += velocityX * delta;
    currentY += velocityY * delta;

    pivot.rotation.x = currentX;
    pivot.rotation.y = currentY;
    pivot.rotation.z = currentY * -0.06;
    render();
  };
  animationFrame = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(animationFrame);
    visibilityObserver.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("blur", rest);
    host.removeEventListener("pointerleave", rest);
  };
}
