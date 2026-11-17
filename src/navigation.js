export const VIEWS = { living: 0, desk: Math.PI / 2 };
export const YAW_LIMITS = [-0.12, VIEWS.desk];
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
