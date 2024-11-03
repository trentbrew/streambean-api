import fs from 'fs'
import path from 'path'

const filePath = path.join(__dirname, '../snapshots/509658.json')

function getSecondsFromDuration(duration) {
  const timeParts = duration.match(/(\d+h)?(\d+m)?(\d+s)?/)
  let seconds = 0

  if (timeParts[1]) {
    seconds += parseInt(timeParts[1]) * 3600
  }
  if (timeParts[2]) {
    seconds += parseInt(timeParts[2]) * 60
  }
  if (timeParts[3]) {
    seconds += parseInt(timeParts[3])
  }

  return seconds
}

function extractSecondsFromJson(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  return data.map((item) => getSecondsFromDuration(item.duration))
}

const secondsArray = extractSecondsFromJson(filePath)
console.log(secondsArray)

const totalSeconds = secondsArray.reduce((acc, curr) => acc + curr, 0)
console.log('Total seconds:', totalSeconds)

function formatSecondsToHHMMSS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const formattedTime = formatSecondsToHHMMSS(totalSeconds)
console.log('Total time (HH:MM:SS):', formattedTime)

export { getSecondsFromDuration, formatSecondsToHHMMSS }
