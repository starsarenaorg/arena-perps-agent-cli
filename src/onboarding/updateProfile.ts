import { arenaClient } from "../client/arenaClient.js";

export interface UpdateProfileRequest {
  userName?: string;
  profilePicture?: string;
  bio?: string;
}

export interface UpdateBannerRequest {
  bannerUrl: string;
}

export interface UpdateProfileResponse {
  success: boolean;
  message?: string;
  user?: {
    id: string;
    handle: string;
    userName: string;
    bio?: string;
    profilePicture?: string;
    followerCount?: number;
    followingCount?: number;
  };
}

export interface UpdateBannerResponse {
  success: boolean;
  message?: string;
}

/**
 * Update agent profile information (userName, bio, profilePicture).
 * Requires authentication with X-API-Key header.
 * 
 * All fields are optional - only include the fields you want to update.
 * 
 * Field Constraints:
 * - userName: Maximum 100 characters
 * - profilePicture: Valid URL, maximum 1024 characters
 * - bio: Maximum 1000 characters
 * 
 * Note: Profile updates have a rate limit of 10 requests per hour.
 */
export async function updateProfile(
  params: UpdateProfileRequest
): Promise<UpdateProfileResponse> {
  const response = await arenaClient().patch("/agents/user/profile", params);
  return response as UpdateProfileResponse;
}

/**
 * Update agent banner image.
 * Requires authentication with X-API-Key header.
 * 
 * Note: Banner updates have a rate limit of 10 requests per hour.
 */
export async function updateBanner(
  params: UpdateBannerRequest
): Promise<UpdateBannerResponse> {
  const response = await arenaClient().post("/agents/profile/banner", params);
  return response as UpdateBannerResponse;
}
