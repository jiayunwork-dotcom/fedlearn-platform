import React, { useState, useMemo } from 'react'
import {
  Box, Typography, Tooltip, Paper
} from '@mui/material'

function accuracyToColor(accuracy) {
  if (accuracy === null || accuracy === undefined || isNaN(accuracy)) {
    return '#f5f5f5'
  }

  const hue = 120
  const saturation = 60
  const lightness = 90 - (accuracy * 50)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

export default function ClientAccuracyHeatmap({ clientMetricsHistory = [], numClients = 0 }) {
  const [hoveredCell, setHoveredCell] = useState(null)

  const heatmapData = useMemo(() => {
    const data = []
    for (let cid = 0; cid < numClients; cid++) {
      const row = []
      clientMetricsHistory.forEach((roundData, roundIdx) => {
        const metrics = roundData.client_metrics
        const clientMetric = metrics[String(cid)] || metrics[cid]
        if (clientMetric && clientMetric.participated) {
          row.push({
            round: roundIdx + 1,
            round_num: roundData.round_num,
            client_id: cid,
            accuracy: clientMetric.accuracy,
            loss: clientMetric.loss,
            participated: true
          })
        } else {
          row.push({
            round: roundIdx + 1,
            round_num: roundData.round_num,
            client_id: cid,
            accuracy: null,
            loss: null,
            participated: false
          })
        }
      })
      data.push(row)
    }
    return data
  }, [clientMetricsHistory, numClients])

  if (numClients === 0 || clientMetricsHistory.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          暂无数据
        </Typography>
      </Box>
    )
  }

  const cellWidth = Math.max(24, Math.min(48, 800 / clientMetricsHistory.length))
  const cellHeight = 28

  return (
    <Box>
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
          {clientMetricsHistory.map((_, idx) => (
            <Box
              key={idx}
              sx={{
                width: cellWidth,
                flexShrink: 0,
                textAlign: 'center',
                fontSize: 10,
                color: 'text.secondary',
                pb: 0.5
              }}
            >
              {idx + 1}
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
                color: 'text.secondary',
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
              {row.map((cell, idx) => (
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
                        : '1px solid rgba(0,0,0,0.05)',
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        transform: 'scale(1.1)',
                        zIndex: 1,
                        position: 'relative'
                      }
                    }}
                  />
                </Tooltip>
              ))}
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 2, gap: 2 }}>
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
