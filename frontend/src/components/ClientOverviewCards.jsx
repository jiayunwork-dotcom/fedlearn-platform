import React, { useState, useEffect, useRef } from 'react'
import {
  Card, CardContent, Typography, Grid, Chip, Box, Stack
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import PauseCircleIcon from '@mui/icons-material/PauseCircle'
import WarningIcon from '@mui/icons-material/Warning'
import GppBadIcon from '@mui/icons-material/GppBad'

function useAnimatedNumber(targetValue, duration = 500) {
  const [displayValue, setDisplayValue] = useState(targetValue)
  const previousValue = useRef(targetValue)
  const animationRef = useRef(null)

  useEffect(() => {
    if (targetValue === null || targetValue === undefined || isNaN(targetValue)) {
      setDisplayValue(targetValue)
      previousValue.current = targetValue
      return
    }

    const startValue = previousValue.current !== null && !isNaN(previousValue.current)
      ? previousValue.current
      : targetValue

    if (startValue === targetValue) {
      return
    }

    const startTime = performance.now()

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      const currentValue = startValue + (targetValue - startValue) * easeProgress

      setDisplayValue(currentValue)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        previousValue.current = targetValue
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [targetValue, duration])

  return displayValue
}

const STATUS_CONFIG = {
  training: {
    label: '训练中',
    color: 'success',
    icon: CheckCircleIcon,
    bgGradient: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
    borderColor: '#81c784'
  },
  idle: {
    label: '空闲',
    color: 'default',
    icon: PauseCircleIcon,
    bgGradient: 'linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%)',
    borderColor: '#bdbdbd'
  },
  offline: {
    label: '掉线',
    color: 'warning',
    icon: WarningIcon,
    bgGradient: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
    borderColor: '#ffb74d'
  },
  malicious: {
    label: '被标记为恶意',
    color: 'error',
    icon: GppBadIcon,
    bgGradient: 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)',
    borderColor: '#e57373'
  }
}

function ClientCard({ client }) {
  const config = STATUS_CONFIG[client.status] || STATUS_CONFIG.idle
  const StatusIcon = config.icon

  const animatedLoss = useAnimatedNumber(client.latest_loss)
  const animatedAccuracy = useAnimatedNumber(client.latest_accuracy)
  const animatedRounds = useAnimatedNumber(client.participated_rounds)

  return (
    <Card
      sx={{
        height: '100%',
        background: config.bgGradient,
        border: 2,
        borderColor: config.borderColor,
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4
        }
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <StatusIcon color={config.color} sx={{ fontSize: 20 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
            Client {client.client_id}
          </Typography>
          <Chip
            label={config.label}
            size="small"
            color={config.color}
            variant="outlined"
          />
        </Stack>

        <Grid container spacing={2}>
          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              本地 Loss
            </Typography>
            <Typography
              variant="body1"
              sx={{
                fontWeight: 600,
                fontFamily: 'monospace',
                color: client.latest_loss !== null ? 'text.primary' : 'text.disabled'
              }}
            >
              {client.latest_loss !== null && animatedLoss !== null
                ? animatedLoss.toFixed(4)
                : '-'}
            </Typography>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              本地精度
            </Typography>
            <Typography
              variant="body1"
              sx={{
                fontWeight: 600,
                fontFamily: 'monospace',
                color: client.latest_accuracy !== null ? 'success.main' : 'text.disabled'
              }}
            >
              {client.latest_accuracy !== null && animatedAccuracy !== null
                ? `${(animatedAccuracy * 100).toFixed(2)}%`
                : '-'}
            </Typography>
          </Grid>

          <Grid item xs={12}>
            <Box sx={{
              mt: 1,
              pt: 1,
              borderTop: 1,
              borderColor: 'divider',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <Typography variant="caption" color="text.secondary">
                累计参与轮次
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: 'primary.main'
                }}
              >
                {animatedRounds !== null ? Math.round(animatedRounds) : 0}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

export default function ClientOverviewCards({ clients = [], currentRound = 0 }) {
  const trainingCount = clients.filter(c => c.status === 'training').length
  const idleCount = clients.filter(c => c.status === 'idle').length
  const maliciousCount = clients.filter(c => c.status === 'malicious').length

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
        <Chip
          label={`总客户端: ${clients.length}`}
          color="primary"
          variant="outlined"
        />
        <Chip
          label={`训练中: ${trainingCount}`}
          color="success"
          variant="outlined"
        />
        <Chip
          label={`空闲: ${idleCount}`}
          color="default"
          variant="outlined"
        />
        {maliciousCount > 0 && (
          <Chip
            label={`恶意: ${maliciousCount}`}
            color="error"
            variant="outlined"
          />
        )}
        <Chip
          label={`当前轮次: ${currentRound}`}
          color="info"
          variant="outlined"
        />
      </Stack>

      <Grid container spacing={2}>
        {clients.map(client => (
          <Grid item xs={12} sm={6} md={4} lg={3} xl={2} key={client.client_id}>
            <ClientCard client={client} />
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
