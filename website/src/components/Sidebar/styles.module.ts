import { ILabelStyles, IStackStyles, IStackTokens } from '@fluentui/react'

export const sidebar: IStackStyles = {
  root: {
    backgroundColor: '#F9F9F9',
    margin: '24px',
    padding: '20px',
    height: 'fit-content',
  },
}

export const tokens: IStackTokens = {
  childrenGap: 's2',
}

export const title: ILabelStyles = {
  root: {
    fontWeight: 600,
    fontSize: '1.1rem',
    marginBottom: '5px',
  },
}
