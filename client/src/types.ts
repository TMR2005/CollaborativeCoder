export interface CodeResult {
  output: string;
  error?: string;
}

export interface RoomData {
  code: string;
  language: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
  username: string;
}

export interface UserRoomsResponse {
  rooms: string[];
}
