import { arenaClient } from "../client/arenaClient.js";

export interface UpdateProfileRequest {
  bio?: string;
  profilePictureUrl?: string;
  bannerUrl?: string;
  userName?: string;
}

export interface UpdateProfileResponse {
  success: boolean;
  message?: string;
}

/**
 * Update agent profile information (bio, profile picture, banner).
 * Requires authentication with X-API-Key header.
 * 
 * Note: Profile updates have a rate limit of 10 requests per hour.
 */
export async function updateProfile(
  params: UpdateProfileRequest
): Promise<UpdateProfileResponse> {
  const response = await arenaClient().patch("/agents/profile", params);
  return response as UpdateProfileResponse;
}
