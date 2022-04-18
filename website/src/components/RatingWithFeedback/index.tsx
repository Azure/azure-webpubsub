import React from 'react'
import { FontIcon, Image, ImageFit, Label, Rating, Stack, TextField } from '@fluentui/react'
import * as styles from './styles.module'

export default function RatingWithFeedback(): JSX.Element {
  return (
    <Stack tokens={styles.tokens}>
      <Label styles={styles.title}>Feedback</Label>
      <Label styles={styles.description} disabled>
        How would you rate this demo
      </Label>
      <Stack horizontal tokens={styles.rateTokens}>
        <Rating defaultRating={0} max={10} ariaLabel="rate this demo" ariaLabelFormat="{0} of {1} stars"></Rating>
        {/* todo: bind data */}
        <Label>0</Label>
      </Stack>
      <TextField placeholder="Please input your feedback and suggestions" multiline rows={5} autoAdjustHeight styles={styles.textField}></TextField>
    </Stack>
  )
}
