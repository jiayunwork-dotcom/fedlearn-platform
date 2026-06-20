export const ANOMALY_TYPES = {
  ACCURACY_DROP: 'accuracy_drop',
  LOSS_RISING: 'loss_rising'
}

export const DEFAULT_THRESHOLDS = {
  accuracyDropPercent: 20,
  lossRiseMultiplier: 1.5
}

function computeClientHistory(clientMetricsHistory, clientId) {
  const accuracies = []
  const losses = []
  const roundsParticipated = []

  clientMetricsHistory.forEach(roundData => {
    const metrics = roundData.client_metrics
    const clientMetric = metrics[String(clientId)] || metrics[clientId]
    if (clientMetric && clientMetric.participated) {
      if (clientMetric.accuracy !== null && clientMetric.accuracy !== undefined && !isNaN(clientMetric.accuracy)) {
        accuracies.push({
          round_num: roundData.round_num,
          value: clientMetric.accuracy
        })
      }
      if (clientMetric.loss !== null && clientMetric.loss !== undefined && !isNaN(clientMetric.loss)) {
        losses.push({
          round_num: roundData.round_num,
          value: clientMetric.loss
        })
      }
      roundsParticipated.push(roundData.round_num)
    }
  })

  return { accuracies, losses, roundsParticipated }
}

function computeMean(values) {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v.value, 0) / values.length
}

export function detectAnomalies(clientMetricsHistory, numClients, thresholds = DEFAULT_THRESHOLDS) {
  const { accuracyDropPercent, lossRiseMultiplier } = thresholds
  const anomalyClients = new Set()
  const anomalyEvents = []
  const roundAnomalies = {}

  if (clientMetricsHistory.length === 0 || numClients === 0) {
    return {
      anomalyClients: [],
      anomalyEvents: [],
      roundAnomalies: {},
      clientAnomalyInfo: {}
    }
  }

  const clientAnomalyInfo = {}

  for (let cid = 0; cid < numClients; cid++) {
    const { accuracies, losses } = computeClientHistory(clientMetricsHistory, cid)

    if (accuracies.length < 2 && losses.length < 3) {
      continue
    }

    let isAnomalous = false
    const anomalyReasons = []
    let latestAnomalyType = null
    let latestAnomalyRound = null
    let latestAnomalyValue = null
    let latestAnomalyMean = null
    let latestAnomalyDeviation = null

    if (accuracies.length >= 2) {
      const historicalAccuracies = accuracies.slice(0, -1)
      const latestAccuracy = accuracies[accuracies.length - 1]
      const meanAccuracy = computeMean(historicalAccuracies)

      if (meanAccuracy !== null) {
        const dropPercent = (meanAccuracy - latestAccuracy.value) * 100
        if (dropPercent >= accuracyDropPercent) {
          isAnomalous = true
          latestAnomalyType = ANOMALY_TYPES.ACCURACY_DROP
          latestAnomalyRound = latestAccuracy.round_num
          latestAnomalyValue = latestAccuracy.value
          latestAnomalyMean = meanAccuracy
          latestAnomalyDeviation = -dropPercent
          anomalyReasons.push({
            type: ANOMALY_TYPES.ACCURACY_DROP,
            round_num: latestAccuracy.round_num,
            value: latestAccuracy.value,
            mean: meanAccuracy,
            deviation: -dropPercent,
            message: `精度下降 ${dropPercent.toFixed(2)} 个百分点 (均值: ${(meanAccuracy * 100).toFixed(2)}%, 当前: ${(latestAccuracy.value * 100).toFixed(2)}%)`
          })
        }
      }
    }

    if (losses.length >= 3) {
      const recentLosses = losses.slice(-3)
      const isRising = recentLosses[1].value > recentLosses[0].value &&
                       recentLosses[2].value > recentLosses[1].value

      if (isRising) {
        const historicalLosses = losses.slice(0, -1)
        const meanLoss = computeMean(historicalLosses)
        const latestLoss = recentLosses[2]

        if (meanLoss !== null && latestLoss.value >= meanLoss * lossRiseMultiplier) {
          isAnomalous = true
          if (!latestAnomalyType || latestLoss.round_num > latestAnomalyRound) {
            latestAnomalyType = ANOMALY_TYPES.LOSS_RISING
            latestAnomalyRound = latestLoss.round_num
            latestAnomalyValue = latestLoss.value
            latestAnomalyMean = meanLoss
            latestAnomalyDeviation = ((latestLoss.value - meanLoss) / meanLoss * 100)
          }
          anomalyReasons.push({
            type: ANOMALY_TYPES.LOSS_RISING,
            round_num: latestLoss.round_num,
            value: latestLoss.value,
            mean: meanLoss,
            deviation: ((latestLoss.value - meanLoss) / meanLoss * 100),
            message: `Loss 持续上升且超过均值 ${lossRiseMultiplier} 倍 (均值: ${meanLoss.toFixed(4)}, 当前: ${latestLoss.value.toFixed(4)})`
          })
        }
      }
    }

    if (isAnomalous) {
      anomalyClients.add(cid)
      clientAnomalyInfo[cid] = {
        client_id: cid,
        isAnomalous: true,
        reasons: anomalyReasons,
        latestType: latestAnomalyType,
        latestRound: latestAnomalyRound,
        latestValue: latestAnomalyValue,
        latestMean: latestAnomalyMean,
        latestDeviation: latestAnomalyDeviation
      }

      anomalyReasons.forEach(reason => {
        if (!roundAnomalies[reason.round_num]) {
          roundAnomalies[reason.round_num] = []
        }
        roundAnomalies[reason.round_num].push({
          client_id: cid,
          ...reason
        })
        anomalyEvents.push({
          client_id: cid,
          ...reason
        })
      })
    }
  }

  anomalyEvents.sort((a, b) => a.round_num - b.round_num || a.client_id - b.client_id)

  return {
    anomalyClients: Array.from(anomalyClients).sort((a, b) => a - b),
    anomalyEvents,
    roundAnomalies,
    clientAnomalyInfo
  }
}
