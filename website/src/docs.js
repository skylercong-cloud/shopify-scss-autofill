import './style.css'

// Docs page is static; keep JS minimal.

function initTocActiveState() {
  const tocLinks = Array.from(
    document.querySelectorAll('.docs__toc .toc__link')
  )
  if (!tocLinks.length) return

  const idToLink = new Map()
  for (const link of tocLinks) {
    const href = link.getAttribute('href') || ''
    if (!href.startsWith('#')) continue
    const id = href.slice(1)
    if (!id) continue
    idToLink.set(id, link)
  }

  const sections = Array.from(
    document.querySelectorAll('.docs__content .doc-section[id]')
  )
  if (!sections.length) return

  const headerOffset = 90

  const setActive = (id) => {
    for (const link of tocLinks) link.classList.remove('is-active')
    const activeLink = idToLink.get(id)
    if (activeLink) activeLink.classList.add('is-active')
  }

  const computeActiveId = () => {
    const y = window.scrollY + headerOffset
    let activeId = sections[0].id
    for (const section of sections) {
      if (section.offsetTop <= y) activeId = section.id
      else break
    }
    return activeId
  }

  let ticking = false
  const onScroll = () => {
    if (ticking) return
    ticking = true
    window.requestAnimationFrame(() => {
      ticking = false
      setActive(computeActiveId())
    })
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').slice(1)
    if (id) setActive(id)
  })

  const initialId = (location.hash || '').slice(1)
  setActive(initialId || computeActiveId())
}

initTocActiveState()
