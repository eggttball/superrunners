<script setup vapor>
import { ref } from 'vue'
import { ADMIN_EMAIL, authState, signIn } from '../lib/auth.js'
import Icon from './Icon.vue'

const password = ref('')
const submitting = ref(false)

async function submit() {
  if (!password.value || submitting.value) return
  submitting.value = true
  try { await signIn(password.value) }
  finally { submitting.value = false }
}
</script>

<template>
  <section class="auth-panel panel" aria-labelledby="auth-title">
    <div class="auth-panel-heading">
      <div><span class="eyebrow"><span class="live-dot"></span> PRIVATE ACCESS</span><h2 id="auth-title">登入田徑基地</h2></div>
      <Icon name="settings" :size="20" />
    </div>
    <p class="muted">管理者帳號：{{ ADMIN_EMAIL }}<br />登入後才能使用田徑基地的所有功能。</p>
    <form class="auth-form" @submit.prevent="submit">
      <label class="field">密碼<input v-model="password" type="password" autocomplete="current-password" placeholder="輸入密碼" required /></label>
      <p v-if="authState.error" class="auth-error" role="alert">{{ authState.error }}</p>
      <button class="btn primary" type="submit" :disabled="submitting">{{ submitting ? '登入中…' : '登入' }}<Icon name="arrow" :size="16" /></button>
    </form>
  </section>
</template>
