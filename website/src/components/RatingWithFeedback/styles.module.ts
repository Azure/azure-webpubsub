import { DefaultPalette, FontSizes, FontWeights, ILabelStyles, IStackTokens, ITextFieldStyles } from '@fluentui/react'

export const rateTokens: IStackTokens = {
  childrenGap: 's2',
}

export const title: ILabelStyles = {
  root: {
    //   todo: apply built-in values to other css
    fontSize: FontSizes.size20,
    fontWeight: FontWeights.semibold,
  },
}

export const description: ILabelStyles = {
  root: {
    fontSize: FontSizes.size12,
  },
}

export const tokens: IStackTokens = {
  padding: 20,
  childrenGap: 's1',
}

export const textField: ITextFieldStyles = {
  root: {
    width: '30%',
  },
}
