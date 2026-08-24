export function playerControlsViewModel({ width, reducedMotion = false }) {
  return {
    layout: "phone",
    controls: [{ id: "play", label: "Play" }],
    transition: "fade",
  };
}
