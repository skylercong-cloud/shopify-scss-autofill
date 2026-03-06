function copyIconSvg() {
  return `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/>
  <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
</svg>`
}

export function initCodeCopyButtons() {
  const blocks = Array.from(document.querySelectorAll('.codeblock'))
  if (!blocks.length) return

  for (const block of blocks) {
    const code = block.querySelector('code')
    if (!code) continue

    block.classList.add('codeblock--has-copy')

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'codeblock__copy'
    btn.setAttribute('aria-label', '复制代码')
    btn.title = '复制代码'
    btn.innerHTML = copyIconSvg()

    btn.addEventListener('click', async () => {
      const text = code.textContent || ''
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', 'true')
        ta.style.position = 'absolute'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }

      btn.classList.add('is-copied')
      btn.title = '已复制'
      setTimeout(() => {
        btn.classList.remove('is-copied')
        btn.title = '复制代码'
      }, 1000)
    })

    block.appendChild(btn)
  }
}
