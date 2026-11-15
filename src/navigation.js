export const VIEWS = { living: -0.12, desk: 0.3 };
export const YAW_LIMITS = [-0.24, 0.3];
export function clampYaw(yaw, limits = YAW_LIMITS) { return Math.max(limits[0], Math.min(limits[1], yaw)); }
export function viewYaw(view, limits = YAW_LIMITS) { return view === 'desk' ? limits[1] : clampYaw(VIEWS.living, limits); }
export function pointerYaw(view, normalizedX, limits = YAW_LIMITS) {
  const x = Math.max(-1, Math.min(1, normalizedX));
  const center = viewYaw(view, limits);
  return clampYaw(center + x * (x < 0 ? center - limits[0] : limits[1] - center), limits);
}
export function smoothYaw(current, target, dt, limits = YAW_LIMITS) {
  return current + (clampYaw(target, limits) - current) * (1 - Math.exp(-dt * 4));
}

// Stop exactly when the cabinet's rightmost projected corner has entered the frame.
// The projection callback accounts for the fixed camera's pitch and screen aspect.
export function fitRightYaw(projectRightEdge, edge = 0.92) {
  let low = VIEWS.living, high = 0.85;
  if (projectRightEdge(low) <= edge) return low;
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2;
    if (projectRightEdge(mid) > edge) low = mid;
    else high = mid;
  }
  return high;
}
