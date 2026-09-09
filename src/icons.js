import arrowLeft from '@fortawesome/fontawesome-free/svgs/solid/arrow-left.svg?raw'
import arrowRight from '@fortawesome/fontawesome-free/svgs/solid/arrow-right.svg?raw'
import envelope from '@fortawesome/fontawesome-free/svgs/solid/envelope.svg?raw'
import fileLines from '@fortawesome/fontawesome-free/svgs/solid/file-lines.svg?raw'
import folder from '@fortawesome/fontawesome-free/svgs/solid/folder.svg?raw'
import house from '@fortawesome/fontawesome-free/svgs/solid/house.svg?raw'
import newspaper from '@fortawesome/fontawesome-free/svgs/solid/newspaper.svg?raw'
import user from '@fortawesome/fontawesome-free/svgs/solid/user.svg?raw'

// These are unmodified Font Awesome library assets. Keeping them as imported
// SVGs gives the portable control panel one consistent industrial icon language.
export const ICONS = {
  contact: envelope,
  resume: fileLines,
  projects: folder,
  home: house,
  articles: newspaper,
  about: user,
  enter: arrowRight,
  back: arrowLeft,
}

export function createIcon(svg, className = 'key__icon') {
  const wrapper = document.createElement('span')
  wrapper.className = className
  wrapper.setAttribute('aria-hidden', 'true')

  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const icon = parsed.documentElement
  if (icon?.nodeName.toLowerCase() === 'svg') wrapper.appendChild(document.importNode(icon, true))
  return wrapper
}
