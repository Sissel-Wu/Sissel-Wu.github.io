export const VIEWS = { living: -0.12, desk: 0.49 };
export const YAW_LIMITS = [-0.24, 0.61];
export function clampYaw(yaw) { return Math.max(YAW_LIMITS[0], Math.min(YAW_LIMITS[1], yaw)); }
export function pointerYaw(view, normalizedX) { const x = Math.max(-1, Math.min(1, normalizedX)); return clampYaw(VIEWS[view] + x * (x < 0 ? VIEWS[view] - YAW_LIMITS[0] : YAW_LIMITS[1] - VIEWS[view])); }
export function smoothYaw(current, target, dt) { return current + (clampYaw(target) - current) * (1 - Math.exp(-dt * 4)); }
