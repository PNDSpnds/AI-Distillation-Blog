import { createContext, useContext } from 'react'
import { mockProfile } from '@/data/mockProfile'
import type { ProfileInfo } from '@/types/chat'

/** 站点信息上下文：默认用本地 mock，真实数据由 ProfileProvider 填进来 */
export const ProfileContext = createContext<ProfileInfo>(mockProfile)

export function useProfile() {
  return useContext(ProfileContext)
}
