<script setup vapor>
import { ref } from 'vue'
import { authState, signIn } from '../lib/auth.js'
import Icon from './Icon.vue'

const email = ref('')
const password = ref('')
const submitting = ref(false)

async function submit() {
  if (!email.value || !password.value || submitting.value) return
  submitting.value = true
  try { await signIn(email.value, password.value) }
  finally { submitting.value = false }
}
</script>

<template>
  <section class="auth-panel panel" aria-labelledby="auth-title">
    <div class="auth-panel-heading">
      <div><span class="eyebrow"><span class="live-dot"></span> PRIVATE ACCESS</span><h2 id="auth-title">登入田徑基地</h2></div>
      <Icon name="settings" :size="20" />
    </div>
    <p class="muted">使用管理者帳號登入，跨裝置保留你的登入狀態。</p>
    <form class="auth-form" @submit.prevent="submit">
      <label class="field">Email<input v-model="email" type="email" autocomplete="email" placeholder="name@example.com" required /></label>
      <label class="field">密碼<input v-model="password" type="password" autocomplete="current-password" placeholder="輸入密碼" required /></label>
      <p v-if="authState.error" class="auth-error" role="alert">{{ authState.error }}</p>
      <button class="btn primary" type="submit" :disabled="submitting">{{ submitting ? '登入中…' : '登入' }}<Icon name="arrow" :size="16" /></button>
    </form>
  </section>
</template>
