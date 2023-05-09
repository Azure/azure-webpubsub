import { useMediaQuery } from 'react-responsive'

// refer to https://developer.microsoft.com/en-us/fluentui#/styles/web/layout
const isMobileDevice = () => useMediaQuery({ query: '(max-width: 639px)' })
const isPortraitDevice = () => useMediaQuery({ query: '(orientation: portrait)' })

export const IsWideDevice = () => {
  const isMobile = isMobileDevice()
  const isPortrait = isPortraitDevice()
  return (isMobile && !isPortrait) || !isMobile
}
