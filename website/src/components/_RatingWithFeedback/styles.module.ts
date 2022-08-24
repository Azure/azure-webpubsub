import { IStackStyles, FontSizes, FontWeights, ILabelStyles, IStackTokens, ITextFieldStyles } from '@fluentui/react'

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

export const background: IStackStyles = {
  root: {
    padding: '40px 0 10px 0',
  },
}

export const textFieldWide: ITextFieldStyles = {
  root: {
    width: '30%',
  },
}

export const textFieldSmall: ITextFieldStyles = {
  root: {
    width: '100%',
  },
}
