import { IImageStyles, ILabelStyles, IStackStyles, IStackTokens } from '@fluentui/react'

export const image: IImageStyles = {
  root: {
    margin: '4rem',
  },
  image: null,
}

export const centerAlignItems: IStackStyles = {
  root: {
    alignItems: 'center',
  },
}

export const tokens: IStackTokens = {
  childrenGap: 's2',
}

export const know: ILabelStyles = {
  root: {
    fontWeight: 400,
  },
}

export const tellus: ILabelStyles = {
  root: {
    fontWeight: 700,
  },
}

export const title: ILabelStyles = {
  root: {
    fontWeight: 600,
    fontSize: '1.8rem',
  },
}
