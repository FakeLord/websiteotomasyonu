const DEVICE_ID_KEY = "lbf.device_id";

/** Bu tarayıcı/cihaz için kalıcı kimlik; `worker_leases` kilidinin sahibini belirler. */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
