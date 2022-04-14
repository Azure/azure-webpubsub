import React from 'react'
import {
  IPersonaSharedProps,
  Persona,
  PersonaSize,
  PersonaPresence,
  Stack,
  StackItem,
  Label,
  TeachingBubble,
  DirectionalHint,
  TeachingBubbleContent,
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
      <div style={{ margin: '30px 55px' }}>
        <div style={{ marginBottom: '15px' }}>
          <div style={{ borderRadius: '2px', backgroundColor: '#C7E0F4', padding: '20px 24px', width: '100%' }}>
            <Label styles={styles.title}>Title</Label>
            <Label styles={styles.description}>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Facere, nulla, ipsum? Molestiae quis aliquam </Label>
          </div>
          <div
            style={{ transform: 'rotate(45deg)', backgroundColor: '#C7E0F4', position: 'relative', top: '-15px', right: '-8px', width: 20, height: 20 }}
          ></div>
        </div>
        <Persona {...persona} size={PersonaSize.size40} presence={PersonaPresence.none} imageAlt="Customer" />
      </div>
    </Stack>
  )
}
