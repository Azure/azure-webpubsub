import React from 'react'
import {
  IPersonaSharedProps,
  Persona,
  PersonaSize,
  PersonaPresence,
  Stack,
  Label,
} from '@fluentui/react'
import * as styles from './styles.module'

const persona: IPersonaSharedProps = {
  imageUrl: 'img/persona.png',
  imageInitials: 'MK',
  text: 'Mona Kane',
  secondaryText: 'Software Engineer',
  showSecondaryText: true,
}

export default function Story(): JSX.Element {
  return (
    <Stack>
      <div style={styles.story}>
        <div style={styles.bubble}>
          <div style={styles.bubbleBackground}>
            <Label styles={styles.title}>Title</Label>
            <Label styles={styles.description}>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Facere, nulla, ipsum? Molestiae quis aliquam </Label>
          </div>
          <div
            style={styles.bubbleTriangle}
          ></div>
        </div>
        <Persona {...persona} size={PersonaSize.size40} presence={PersonaPresence.none} imageAlt="Customer" />
      </div>
    </Stack>
  )
}
