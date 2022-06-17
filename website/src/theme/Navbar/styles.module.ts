import { IStackStyles, IStackTokens, DefaultPalette, ILinkStyles } from '@fluentui/react'
import { ISearchBoxStyles } from '@fluentui/react/lib/SearchBox'
import { ILabelStyles } from '@fluentui/react/lib/Label'
import { mergeStyleSets } from '@fluentui/react/lib/Styling'

export const titleLink: ILinkStyles = {
  root: {
    textDecoration: 'none',
  },
}

export const title: ILabelStyles = {
  root: {
    fontWeight: 600,
    color: DefaultPalette.white,
    cursor: 'pointer',
  },
}

export const navBar: IStackStyles = {
  root: {
    background: DefaultPalette.themePrimary,
    alignItems: 'center',
  },
}

export const imageIcon: ILinkStyles = {
  root: {
    display: 'flex',
  },
}

export const leftNav: IStackStyles = {
  root: {
    padding: '0 0 0 10px',
    alignItems: 'center',
    background: DefaultPalette.themePrimary,
    color: DefaultPalette.white,
  },
}

export const rightNav: IStackStyles = {
  root: {
    padding: 0,
    alignItems: 'center',
    background: DefaultPalette.themePrimary,
    color: DefaultPalette.white,
  },
}

export const searchBox: ISearchBoxStyles = {
  root: {
    opacity: 0.8,
  },
}

export const stackTokens: IStackTokens = {
  childrenGap: 5,
  padding: 5,
}

export const leftNavTokens = {
  childrenGap: 'l1',
  padding: 'l1',
}

export const rightNavTokens = {
  childrenGap: 'm',
  padding: 'm',
}

export const classNames = mergeStyleSets({
  image: {
    display: 'inline-block',
    position: 'relative',
    backgroundColor: 'white',
  },
  logo: {
    width: 25,
    height: 25,
  },
  logoImage: {
    left: 0,
    top: 0,
  },
  navBarIcon: {
    fontSize: '1.5rem',
    height: '0.5rem',
  },
  titleLink: {
    'a:hover': {
      textDecoration: 'none',
    },
  },
})

export const root: React.CSSProperties = {
  backgroundColor: '',
  display: 'block',
  height: 'auto',
  padding: 0,
}
