import React, { useState, useRef, useMemo, useEffect } from 'react'
import {
  Box, Typography, Paper, Tooltip, Popover, Stack, Chip
} from '@mui/material'
import { ANOMALY_TYPES } from '../utils/anomalyDetection'

const ANOMALY_COLORS = {
  [ANOMALY_TYPES.ACCURACY_DROP]: '#ff9800',
  [ANOMALY_TYPES.LOSS_RISING]: '#9c27b0'
}

const ANOMALY_TYPE_LABELS = {
  [ANOMALY_TYPES.ACCURACY_DROP]: '精度骤降',
  [ANOMALY_TYPES.LOSS_RISING]: 'Loss 持续上升'
}

export default function AnomalyEventTimeline({
  anomalyEvents = [],
  totalRounds = 0,
  clientMetricsHistory = []
}) {
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [anchorEl, setAnchorEl] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState(0)
  const containerRef = useRef(null)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartOffset = useRef(0)

  const actualTotalRounds = useMemo(() => {
    if (totalRounds > 0) return totalRounds
    return clientMetricsHistory.length
  }, [totalRounds, clientMetricsHistory])

  const minRound = 1
  const maxRound = actualTotalRounds

  const minZoom = 1
  const maxZoom = 10

  const containerWidth = 800
  const timelinePadding = 40

  const getTimelinePosition = (roundNum) => {
    const effectiveWidth = (containerWidth - timelinePadding * 2) * zoom
    const range = Math.max(maxRound - minRound, 1)
    return timelinePadding + ((roundNum - minRound) / range) * effectiveWidth + panOffset
  }

  const handleMouseDown = (e) => {
    if (e.target.closest('.timeline-dot')) return
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartOffset.current = panOffset
    containerRef.current.style.cursor = 'grabbing'
  }

  const handleMouseMove = (e) => {
    if (!isDragging.current) return
    const deltaX = e.clientX - dragStartX.current
    const newOffset = dragStartOffset.current + deltaX
    const effectiveWidth = (containerWidth - timelinePadding * 2) * zoom
    const maxOffset = 0
    const minOffset = Math.min(0, containerWidth - timelinePadding * 2 - effectiveWidth)
    setPanOffset(Math.max(minOffset, Math.min(maxOffset, newOffset)))
  }

  const handleMouseUp = () => {
    isDragging.current = false
    containerRef.current.style.cursor = 'grab'
  }

  const handleMouseLeave = () => {
    isDragging.current = false
    containerRef.current.style.cursor = 'grab'
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom * delta))
    setZoom(newZoom)
  }

  useEffect(() => {
    setPanOffset(0)
  }, [actualTotalRounds])

  const handleDotClick = (event, anomalyEvent) => {
    setSelectedEvent(anomalyEvent)
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setSelectedEvent(null)
    setAnchorEl(null)
  }

  if (anomalyEvents.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          暂无异常事件
        </Typography>
      </Box>
    )
  }

  const tickInterval = Math.max(1, Math.round((maxRound - minRound) / (10 / zoom)))

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
        <Chip
          icon={<span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: ANOMALY_COLORS[ANOMALY_TYPES.ACCURACY_DROP] }} />}
          label={`精度骤降: ${anomalyEvents.filter(e => e.type === ANOMALY_TYPES.ACCURACY_DROP).length}`}
          size="small"
          variant="outlined"
          sx={{ borderColor: ANOMALY_COLORS[ANOMALY_TYPES.ACCURACY_DROP], color: ANOMALY_COLORS[ANOMALY_TYPES.ACCURACY_DROP] }}
        />
        <Chip
          icon={<span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: ANOMALY_COLORS[ANOMALY_TYPES.LOSS_RISING] }} />}
          label={`Loss 持续上升: ${anomalyEvents.filter(e => e.type === ANOMALY_TYPES.LOSS_RISING).length}`}
          size="small"
          variant="outlined"
          sx={{ borderColor: ANOMALY_COLORS[ANOMALY_TYPES.LOSS_RISING], color: ANOMALY_COLORS[ANOMALY_TYPES.LOSS_RISING] }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
          拖拽平移 · 滚轮缩放
        </Typography>
      </Stack>

      <Box
        ref={containerRef}
        className="timeline-scroll-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        sx={{
          position: 'relative',
          width: '100%',
          height: 100,
          overflow: 'hidden',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: '#fafafa'
        }}
      >
        <svg
          width="100%"
          height="100%"
          style={{ overflow: 'visible' }}
          viewBox={`0 0 ${containerWidth} 100`}
          preserveAspectRatio="none"
        >
          <line
            x1={timelinePadding + panOffset}
            y1={50}
            x2={getTimelinePosition(maxRound)}
            y2={50}
            stroke="#bdbdbd"
            strokeWidth={2}
          />

          {Array.from({ length: Math.floor((maxRound - minRound) / tickInterval) + 1 }, (_, i) => {
            const round = minRound + i * tickInterval
            const x = getTimelinePosition(round)
            return (
              <g key={round}>
                <line
                  x1={x}
                  y1={45}
                  x2={x}
                  y2={55}
                  stroke="#9e9e9e"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={72}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#666"
                >
                  {round}
                </text>
              </g>
            )
          })}

          {anomalyEvents.map((event, idx) => {
            const x = getTimelinePosition(event.round_num)
            const yOffset = (idx % 3 - 1) * 12
            return (
              <g key={`${event.client_id}-${event.round_num}-${event.type}`}>
                <line
                  x1={x}
                  y1={50}
                  x2={x}
                  y2={50 + yOffset}
                  stroke={ANOMALY_COLORS[event.type]}
                  strokeWidth={1}
                  opacity={0.5}
                />
                <circle
                  className="timeline-dot"
                  cx={x}
                  cy={50 + yOffset}
                  r={7}
                  fill={ANOMALY_COLORS[event.type]}
                  stroke="white"
                  strokeWidth={2}
                  onClick={(e) => handleDotClick(e, event)}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            )
          })}
        </svg>
      </Box>

      <Popover
        open={selectedEvent !== null}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center'
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center'
        }}
      >
        {selectedEvent && (
          <Box sx={{ p: 2, minWidth: 280 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: ANOMALY_COLORS[selectedEvent.type]
                }}
              />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {ANOMALY_TYPE_LABELS[selectedEvent.type]}
              </Typography>
            </Stack>

            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">客户端编号</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                Client {selectedEvent.client_id}
              </Typography>
            </Box>

            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">触发轮次</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                Round {selectedEvent.round_num}
              </Typography>
            </Box>

            {selectedEvent.type === ANOMALY_TYPES.ACCURACY_DROP ? (
              <>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">当前精度</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'warning.main' }}>
                    {(selectedEvent.value * 100).toFixed(2)}%
                  </Typography>
                </Box>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">历史均值</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {(selectedEvent.mean * 100).toFixed(2)}%
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">偏差</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'error.main' }}>
                    {selectedEvent.deviation.toFixed(2)} 个百分点
                  </Typography>
                </Box>
              </>
            ) : (
              <>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">当前 Loss</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'warning.main' }}>
                    {selectedEvent.value.toFixed(4)}
                  </Typography>
                </Box>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">历史均值</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {selectedEvent.mean.toFixed(4)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">偏差</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'error.main' }}>
                    +{selectedEvent.deviation.toFixed(2)}%
                  </Typography>
                </Box>
              </>
            )}

            <Box sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary">
                {selectedEvent.message}
              </Typography>
            </Box>
          </Box>
        )}
      </Popover>
    </Box>
  )
}
