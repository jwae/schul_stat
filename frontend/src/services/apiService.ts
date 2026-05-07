import apiClient from "./apiClient";
import type { 
  StudentStrengthRow, 
  ClassStrengthRow, 
  DazRow, 
  OverviewData, 
  TeacherData, 
  School, 
  Snapshot, 
  LoginResponse, 
  ConnectionStatus, 
  ConnectionResponse,
  User
} from "../types";

/**
 * Service for interacting with the Schul-Stat Backend API.
 * Uses the standardized apiClient with interceptors.
 */

export const kpiService = {
  async getStudentStrengths(params: any) {
    const resp = await apiClient.get<{ rows: StudentStrengthRow[] }>("/api/kpi/student-strengths/by-school-snapshot", { params });
    return resp.data;
  },

  async getClassStrengths(params: any) {
    const resp = await apiClient.get<{ rows: ClassStrengthRow[] }>("/api/kpi/class-strengths/by-school", { params });
    return resp.data;
  },

  async getDaz(params: any) {
    const resp = await apiClient.get<{ rows: DazRow[] }>("/api/kpi/daz/by-school", { params });
    return resp.data;
  },

  async getOverview(params: any) {
    const resp = await apiClient.get<OverviewData>("/api/kpi/overview", { params });
    return resp.data;
  },

  async getTeachers(params: any) {
    const resp = await apiClient.get<TeacherData>("/api/kpi/teachers", { params });
    return resp.data;
  }
};

export const metaService = {
  async getSchools(params: any) {
    const resp = await apiClient.get<School[]>("/api/meta/schools", { params });
    return resp.data;
  },

  async getSnapshots(params: any) {
    const resp = await apiClient.get<Snapshot[]>("/api/meta/snapshots", { params });
    return resp.data;
  }
};

export const authService = {
  async login(credentials: any) {
    const resp = await apiClient.post<LoginResponse>("/api/auth/login", credentials);
    return resp.data;
  },

  async logout() {
    return apiClient.post("/api/auth/logout");
  }
};

export const connectionService = {
  async getStatus() {
    const resp = await apiClient.get<ConnectionStatus>("/api/connection/status");
    return resp.data;
  },

  async connect(payload: any) {
    const resp = await apiClient.post<ConnectionResponse>("/api/connection/connect", payload);
    return resp.data;
  }
};
