import bars from '@fortawesome/fontawesome-free/svgs/solid/bars.svg?raw'
import envelope from '@fortawesome/fontawesome-free/svgs/solid/envelope.svg?raw'
import fileLines from '@fortawesome/fontawesome-free/svgs/solid/file-lines.svg?raw'
import folder from '@fortawesome/fontawesome-free/svgs/solid/folder.svg?raw'
import house from '@fortawesome/fontawesome-free/svgs/solid/house.svg?raw'
import newspaper from '@fortawesome/fontawesome-free/svgs/solid/newspaper.svg?raw'
import user from '@fortawesome/fontawesome-free/svgs/solid/user.svg?raw'

// These are unmodified Font Awesome library assets. Keeping them as imported
// SVGs gives the portable control panel the filled, industrial icon language
// shown in the mobile reference without drawing substitute icons in CSS.
export const ICONS = { bars, contact: envelope, resume: fileLines, projects: folder,
  home: house, articles: newspaper, about: user }
