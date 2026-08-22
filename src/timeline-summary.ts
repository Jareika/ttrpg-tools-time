export function syncTimelineSummaryLineClamp(
  summaryEl: HTMLElement,
  maximumLines: number
): void {
  const maxLines = Math.max(1, Math.trunc(maximumLines));
  const parentEl = summaryEl.parentElement;

  if (!parentEl) {
    return;
  }

  summaryEl.style.removeProperty("--tl-summary-effective-lines");

  let observer: ResizeObserver | undefined;
  let frameId: number | null = null;

  const update = (): void => {
    if (!summaryEl.isConnected) {
      observer?.disconnect();

      if (frameId !== null) {
        summaryEl.ownerDocument.defaultView?.cancelAnimationFrame(frameId);
        frameId = null;
      }

      return;
    }

    const styles = getComputedStyle(summaryEl);
    const configuredLineHeight = Number.parseFloat(styles.lineHeight);
    const fontSize = Number.parseFloat(styles.fontSize);
    const lineHeight =
      Number.isFinite(configuredLineHeight) && configuredLineHeight > 0
        ? configuredLineHeight
        : Math.max(1, fontSize || 16) * 1.4;

    const parentRect = parentEl.getBoundingClientRect();
    const summaryRect = summaryEl.getBoundingClientRect();

    if (
      parentRect.width <= 0 ||
      parentRect.height <= 0 ||
      summaryRect.width <= 0
    ) {
      return;
    }

    const parentStyles = getComputedStyle(parentEl);
    const paddingBottom = Number.parseFloat(parentStyles.paddingBottom) || 0;
    const contentBottom =
      parentRect.top +
      parentEl.clientTop +
      parentEl.clientHeight -
      paddingBottom;
    const availableHeight = Math.max(0, contentBottom - summaryRect.top);

    const fittingLines = Math.floor(
      (availableHeight + 0.5) / lineHeight
    );
    const nextLineCount = String(
      Math.max(1, Math.min(maxLines, fittingLines))
    );

    if (
      summaryEl.style.getPropertyValue("--tl-summary-effective-lines") !==
      nextLineCount
    ) {
      summaryEl.style.setProperty(
        "--tl-summary-effective-lines",
        nextLineCount
      );
    }
  };
  
  const scheduleUpdate = (): void => {
    if (frameId !== null) {
      return;
    }

    const view = summaryEl.ownerDocument.defaultView;

    if (!view) {
      update();
      return;
    }

    frameId = view.requestAnimationFrame(() => {
      frameId = null;
      update();
    });
  };

  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => {
      scheduleUpdate();
    });

    observer.observe(summaryEl);
	observer.observe(parentEl);
  }

  update();
  scheduleUpdate();
}