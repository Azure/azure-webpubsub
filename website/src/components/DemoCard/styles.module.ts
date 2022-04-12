import { IDocumentCardTitleStyles, IStackStyles, ILinkStyles, DefaultPalette, mergeStyles } from '@fluentui/react'

export const title: IDocumentCardTitleStyles = {
  root: {
    wordWrap: 'break-word',
    fontSize: '1rem',
    fontWeight: 500,
    height: '4rem',
  },
}

export const footer: IStackStyles = {
  root: {
    margin: '0 1rem 1rem 1rem',
  },
}

export const footerItem: React.CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  justifyContent: 'center',
}

export const link: ILinkStyles = {
  root: {
    padding: '0 0.5rem 0 0.5rem',
  },
}

export const classNames = {
  share: mergeStyles({
    color: DefaultPalette.blue,
  }),
}
