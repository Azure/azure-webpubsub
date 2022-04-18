import { ILabelStyles, DefaultPalette } from '@fluentui/react'
import React from 'react'

export const title: ILabelStyles = {
  root: {
    fontWeight: 600,
    fontSize: '1.5rem',
    color: DefaultPalette.blue,
    marginBottom: '0.6rem',
  },
}

export const description: ILabelStyles = {
  root: {
    fontWeight: 400,
    fontSize: '1rem',
    color: DefaultPalette.blue,
  },
}

export const bubbleTriangle: React.CSSProperties = {
  transform: 'rotate(45deg)',
  backgroundColor: '#C7E0F4',
  position: 'relative',
  top: '-15px',
  right: '-8px',
  width: 20,
  height: 20,
}

export const bubbleBackground: React.CSSProperties = {
  borderRadius: '2px',
  backgroundColor: '#C7E0F4',
  padding: '20px 24px',
  width: '100%',
}

export const bubble: React.CSSProperties = {
  marginBottom: '15px',
}

export const story: React.CSSProperties = {
  margin: '30px 55px',
}
