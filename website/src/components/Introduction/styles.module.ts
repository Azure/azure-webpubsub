import { IStackItemStyles, IStackItemTokens, IStackStyles } from '@fluentui/react'

export const background: IStackStyles = {
  root: {
    backgroundColor: '#F0F6FF',
  },
}

export const tryDemo: IStackStyles = {
  root: {
    alignItems: 'center',
    marginBottom: '10px',
  },
}

export const tryDemoItem: IStackItemStyles = {
  root: { padding: '0 4rem' },
}

export const content: React.CSSProperties = {
  marginBottom: '2rem',
}

export const title: React.CSSProperties = {
  fontWeight: '600',
  fontSize: '1.2rem',
}

export const preview: React.CSSProperties = {
  padding: '1rem 3rem',
}
