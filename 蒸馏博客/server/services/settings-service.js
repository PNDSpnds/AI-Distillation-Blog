import fs from 'node:fs'
import path from 'node:path'
import { ROOT_DIR, getAdminPassword } from '../config.js'
import { maskSecret } from '../lib/env.js'
import { forbidden } from '../lib/http-error.js'
import { evaluatePassword } from '../lib/password-policy.js'
import { audit } from '../lib/security-log.js'
import { assertBaseUrlSafe } from '../lib/url-guard.js'
import { getDb, mutateDb } from '../repositories/db.js'
import { verifyAdminPassword } from './session.js'
import { clearLlmKey, getLlmKey, setLlmKey } from './secret-store.js'

/** 公开可读的站点信息；不包含任何敏感配置 */
export function getPublicProfile() {
  const { settings } = getDb()
  return {
    siteName: settings.siteName,
    ownerName: settings.ownerName,
    greeting: settings.greeting,
    intro: settings.intro,
    suggestions: settings.suggestions.slice(0, 6),
    footer: settings.footer,
    categories: settings.categories,
  }
}

/** 后台读取完整设置；key 只返回「是否已配置 + 末尾 4 位」，从不回传完整值 */
export function getAdminSettings() {
  const { settings } = getDb()
  const key = getLlmKey()
  const password = evaluatePassword(getAdminPassword())
  return {
    ...settings,
    llmKeyConfigured: Boolean(key),
    llmKeyHint: maskSecret(key),
    /** 密码不够强时：后台挂红条，并且禁止改模型配置 */
    passwordNeedsChange: !password.safe,
    passwordWarning: password.safe ? '' : password.reason,
  }
}

const TEXT_LIMITS = {
  siteName: 30,
  ownerName: 30,
  greeting: 60,
  intro: 400,
  footer: 120,
}

/**
 * 密码不够强时不允许碰模型配置。
 * 为什么：别人用弱口令登进来，就能把 baseUrl 改成自己的服务器，下一次对话把 Key 导走。
 * 这里判断的是"够不够安全"，不再是"是不是等于 admin123"。
 */
function assertSafePassword(ip) {
  const password = evaluatePassword(getAdminPassword())
  if (password.safe) return

  audit('blocked_weak_password', { ip, detail: password.reason })
  throw forbidden(
    `后台密码还不够安全（${password.reason}）。请先改 .env 里的 ADMIN_PASSWORD，至少 12 位并混用字母数字，再来配置模型`,
  )
}

/**
 * 变更模型地址需要重新输入后台密码，防止会话被盗后把 Key 导走。
 * 复用登录那套节流（失败计数 + 指数退避 + 审计），避免这里被当成爆破入口。
 */
async function assertPasswordForBaseUrlChange(input, request) {
  const provided = typeof input?.confirmPassword === 'string' ? input.confirmPassword : ''
  const result = await verifyAdminPassword(provided, request, { action: 'confirm_password' })

  if (!result.ok) {
    audit('blocked_base_url_change', {
      ip: request?.ip ?? '',
      detail: result.locked ? 'locked out' : 'wrong or missing password',
    })
    throw forbidden(result.locked ? '尝试次数过多，请稍后再试' : '修改模型服务地址需要输入正确的后台密码')
  }
}

/**
 * 校验并保存站点设置；字段缺失时保留原值。
 *
 * 安全约定：
 * - Key 只进加密存储，既不写 db.json 也不写 .env 明文。
 * - 换 baseUrl 必须带 confirmPassword。
 * - 默认密码未改时，整条模型配置都不许动。
 */
export async function saveSettings(input, { ip = '', request = null } = {}) {
  const db = getDb()
  const previousBaseUrl = db.settings.model.baseUrl

  const wantsKeyChange =
    input?.clearLlmKey === true ||
    (typeof input?.llmApiKey === 'string' && input.llmApiKey.trim().length > 0)
  const wantsModelChange = Boolean(input?.model && typeof input.model === 'object')

  if (wantsKeyChange || wantsModelChange) {
    assertSafePassword(ip)
  }

  // 先算好新地址并校验权限，再落任何东西，避免"Key 已保存但地址没改成"的半截状态
  let nextBaseUrl = previousBaseUrl
  if (wantsModelChange && typeof input.model.baseUrl === 'string' && input.model.baseUrl.trim()) {
    // 格式 / 私网 / HTTPS / DNS 解析全部在这一步挡住（防 SSRF 与 Key 外泄）
    nextBaseUrl = (await assertBaseUrlSafe(input.model.baseUrl)).url
    if (nextBaseUrl !== previousBaseUrl) {
      await assertPasswordForBaseUrlChange(input, request ?? { ip })
    }
  }

  // Key 存加密文件；放前面执行，后面写库失败也不会丢 Key
  if (input?.clearLlmKey === true) {
    clearLlmKey()
    audit('clear_llm_key', { ip })
  } else if (typeof input?.llmApiKey === 'string' && input.llmApiKey.trim()) {
    setLlmKey(input.llmApiKey)
    audit('change_llm_key', { ip, detail: maskSecret(input.llmApiKey) })
  }

  const saved = await mutateDb((state) => {
    const next = { ...state.settings }

    for (const [key, limit] of Object.entries(TEXT_LIMITS)) {
      if (typeof input[key] === 'string') {
        next[key] = input[key].trim().slice(0, limit)
      }
    }

    if (Array.isArray(input.suggestions)) {
      next.suggestions = input.suggestions
        .filter((item) => item && typeof item.text === 'string' && item.text.trim())
        .slice(0, 6)
        .map((item) => ({
          text: item.text.trim().slice(0, 120),
          hint: typeof item.hint === 'string' ? item.hint.trim().slice(0, 40) : '',
        }))
    }

    if (Array.isArray(input.categories)) {
      const unique = new Set()
      for (const item of input.categories) {
        if (typeof item === 'string' && item.trim()) unique.add(item.trim().slice(0, 30))
      }
      next.categories = [...unique].slice(0, 30)
    }

    if (wantsModelChange) {
      next.model = {
        baseUrl: nextBaseUrl,
        model:
          typeof input.model.model === 'string' && input.model.model.trim()
            ? input.model.model.trim().slice(0, 60)
            : state.settings.model.model,
      }
    }

    state.settings = next
    return next
  })

  if (wantsModelChange && nextBaseUrl !== previousBaseUrl) {
    audit('change_base_url', { ip, detail: nextBaseUrl })
  }

  const key = getLlmKey()
  const password = evaluatePassword(getAdminPassword())
  return {
    ...saved,
    llmKeyConfigured: Boolean(key),
    llmKeyHint: maskSecret(key),
    passwordNeedsChange: !password.safe,
    passwordWarning: password.safe ? '' : password.reason,
  }
}

/** 启动自检用：.env 是否存在 */
export function envFileExists() {
  return fs.existsSync(path.join(ROOT_DIR, '.env'))
}

/** 供内部服务读取明文 key（不对外暴露） */
export { getLlmKey }
