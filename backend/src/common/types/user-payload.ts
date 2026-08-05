export interface UserPayload {
  id: number;
  username: string;
  role: string;
  stationId: number | null;
  districtId: number | null;
}
