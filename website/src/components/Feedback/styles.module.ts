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

export const tellusTokens: IStackTokens = {
  childrenGap: 's2',
}

export const textTokens: IStackTokens = {
  childrenGap: '0',
}

export const know: ILabelStyles = {
  root: {
    fontWeight: 400,
    padding: 0,
    marginBottom: '1.8rem',
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
    padding: 0,
  },
}
