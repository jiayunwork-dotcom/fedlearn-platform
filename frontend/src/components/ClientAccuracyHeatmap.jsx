import React, { useState, useMemo } from 'react'
import {
  Box, Typography, Tooltip, Paper, FormControlLabel, Switch, Stack
} from '@mui/material'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { ANOMALY_TYPES } from '../utils/anomalyDetection'

function accuracyToColor(accuracy) {
  if (accuracy === null || accuracy === undefined || isNaN(accuracy)) {
    return '#f5f5f5'
  }

  const hue = 120
  const saturation = 60
  const lightness = 90 - (accuracy * 50)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

export default function ClientAccuracyHeatmap({
  clientMetricsHistory = [],
  numClients = 0,
  roundAnomalies = {},
  clientAnomalyInfo = {}
}) {
  const [hoveredCell, setHoveredCell] = useState(null)
  const [showOnlyAnomalyRounds, setShowOnlyAnomalyRounds] = useState(false)

  const anomalyRoundNumbers = useMemo(() => {
    return new Set(Object.keys(roundAnomalies).map(Number))
  }, [roundAnomalies])

  const filteredHistory = useMemo(() => {
    if (!showOnlyAnomalyRounds) {
      return clientMetricsHistory.map((rd, idx) => ({ ...rd, originalIdx: idx }))
    }
    return clientMetricsHistory
      .map((rd, idx) => ({ ...rd, originalIdx: idx }))
      .filter(rd => anomalyRoundNumbers.has(rd.round_num))
  }, [clientMetricsHistory, showOnlyAnomalyRounds, anomalyRoundNumbers])

  const heatmapData = useMemo(() => {
    const data = []
    for (let cid = 0; cid < numClients; cid++) {
      const row = []
      filteredHistory.forEach((roundData) => {
        const metrics = roundData.client_metrics
        const clientMetric = metrics[String(cid)] || metrics[cid]
        const anomaliesInCell = roundAnomalies[roundData.round_num]?.filter(a => a.client_id === cid) || []

        if (clientMetric && clientMetric.participated) {
          row.push({
            round: roundData.originalIdx + 1,
            round_num: roundData.round_num,
            client_id: cid,
            accuracy: clientMetric.accuracy,
            loss: clientMetric.loss,
            participated: true,
            anomalies: anomaliesInCell
          })
        } else {
          row.push({
            round: roundData.originalIdx + 1,
            round_num: roundData.round_num,
            client_id: cid,
            accuracy: null,
            loss: null,
            participated: false,
            anomalies: anomaliesInCell
          })
        }
      })
      data.push(row)
    }
    return data
  }, [filteredHistory, numClients, roundAnomalies])

  if (numClients === 0 || clientMetricsHistory.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          暂无数据
        </Typography>
      </Box>
    )
  }

  const cellWidth = Math.max(32, Math.min(56, 800 / Math.max(filteredHistory.length, 1)))
  const cellHeight = 32

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box />
        <FormControlLabel
          control={
            <Switch
              checked={showOnlyAnomalyRounds}
              onChange={(e) => setShowOnlyAnomalyRounds(e.target.checked)}
              color="warning"
              size="small"
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
              <Typography variant="body2">仅显示异常轮次</Typography>
            </Box>
          }
        />
      </Stack>

      <Box sx={{ display: 'flex', mb: 2 }}>
        <Box
          sx={{
            width: 80,
            flexShrink: 0,
            textAlign: 'right',
            pr: 1,
            pt: 0.5
          }}
        />
        <Box
          sx={{
            display: 'flex',
            overflowX: 'auto',
            flex: 1
          }}
        >
          {filteredHistory.map((roundData, idx) => (
            <Box
              key={idx}
              sx={{
                width: cellWidth,
                flexShrink: 0,
                textAlign: 'center',
                fontSize: 10,
                color: anomalyRoundNumbers.has(roundData.round_num) ? 'warning.main' : 'text.secondary',
                fontWeight: anomalyRoundNumbers.has(roundData.round_num) ? 700 : 400,
                pb: 0.5
              }}
            >
              {roundData.round_num}
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex' }}>
        <Box
          sx={{
            width: 80,
            flexShrink: 0,
            pr: 1
          }}
        >
          {heatmapData.map((_, cid) => (
            <Box
              key={cid}
              sx={{
                height: cellHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                fontSize: 11,
                color: clientAnomalyInfo[cid]?.isAnomalous ? 'error.main' : 'text.secondary',
                fontWeight: clientAnomalyInfo[cid]?.isAnomalous ? 700 : 400,
                pr: 1
              }}
            >
              Client {cid}
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            flex: 1,
            overflowX: 'auto',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            p: 0.5,
            bgcolor: '#fafafa'
          }}
        >
          {heatmapData.map((row, cid) => (
            <Box key={cid} sx={{ display: 'flex' }}>
              {row.map((cell, idx) => {
                const hasAnomaly = cell.anomalies && cell.anomalies.length > 0
                const hasLossRising = cell.anomalies?.some(a => a.type === ANOMALY_TYPES.LOSS_RISING)
                const hasAccuracyDrop = cell.anomalies?.some(a => a.type === ANOMALY_TYPES.ACCURACY_DROP)
                return (
                  <Tooltip
                    key={idx}
                    title={
                      <Box sx={{ fontSize: 12 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                          Client {cell.client_id} - Round {cell.round_num}
                        </Typography>
                        {cell.participated ? (
                          <>
                            <Typography variant="body2">
                              accuracy={cell.accuracy !== null ? cell.accuracy.toFixed(4) : '-'}
                            </Typography>
                            <Typography variant="body2">
                              loss={cell.loss !== null ? cell.loss.toFixed(4) : '-'}
                            </Typography>
                          </>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            未参与本轮
                          </Typography>
                        )}
                        {hasAnomaly && (
                          <>
                            <Box sx={{ borderTop: 1, borderColor: 'divider', mt: 1, pt: 1 }} />
                            <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 600 }}>
                              ⚠ 异常标记:
                            </Typography>
                            {cell.anomalies.map((a, i) => (
                              <Typography key={i} variant="body2" sx={{ color: a.type === ANOMALY_TYPES.LOSS_RISING ? '#9c27b0' : '#ff9800' }}>
                                • {a.message}
                              </Typography>
                            ))}
                          </>
                        )}
                      </Box>
                    }
                    placement="top"
                    arrow
                  >
                    <Box
                      onMouseEnter={() => setHoveredCell({ client: cid, round: idx })}
                      onMouseLeave={() => setHoveredCell(null)}
                      sx={{
                        width: cellWidth,
                        height: cellHeight,
                        flexShrink: 0,
                        backgroundColor: accuracyToColor(cell.accuracy),
                        border: hoveredCell?.client === cid && hoveredCell?.round === idx
                          ? '2px solid #1976d2'
                          : hasAnomaly
                            ? '2px solid #ff9800'
                            : '1px solid rgba(0,0,0,0.05)',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        position: 'relative',
                        '&:hover': {
                          transform: 'scale(1.1)',
                          zIndex: 1
                        }
                      }}
                    >
                      {hasAnomaly && (
                        <Box
                          className={`anomaly-triangle ${hasLossRising && !hasAccuracyDrop ? 'anomaly-triangle-loss' : ''}`}
                          sx={{
                            borderLeft: `${Math.min(10, cellWidth / 3)}px solid transparent`,
                            borderTop: `${Math.min(10, cellWidth / 3)}px solid ${hasLossRising && !hasAccuracyDrop ? '#9c27b0' : '#ff9800'}`
                          }}
                        />
                      )}
                    </Box>
                  </Tooltip>
                )
              })}
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box className="anomaly-triangle" sx={{ position: 'relative' }} />
          <Typography variant="caption" color="text.secondary">精度骤降</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box className="anomaly-triangle anomaly-triangle-loss" sx={{ position: 'relative' }} />
          <Typography variant="caption" color="text.secondary">Loss 持续上升</Typography>
        </Box>
        <Box sx={{ width: 1, height: 16, bgcolor: 'divider' }} />
        <Typography variant="caption" color="text.secondary">
          低
        </Typography>
        <Box sx={{ display: 'flex', height: 16 }}>
          {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((v, i) => (
            <Box
              key={i}
              sx={{
                width: 20,
                backgroundColor: accuracyToColor(v),
                border: 1,
                borderColor: 'divider',
                borderLeft: i === 0 ? 1 : 0
              }}
            />
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary">
          高
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
          精度 (0% - 100%)
        </Typography>
      </Box>
    </Box>
  )
}
