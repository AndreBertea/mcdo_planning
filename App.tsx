import React, { useRef, useState, useEffect } from 'react';

// Les 7 jours dans l'ordre
const DAYS = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

/** Stocke la chaîne finale d'OCR pour chaque jour */
type OCRResults = {
  [day: string]: string;
};

/** Un intervalle "HH:MM - HH:MM" structuré pour l'édition */
interface IntervalData {
  startH: string;
  startM: string;
  endH: string;
  endM: string;
}

export default function App() {
  // --------------------------------------------------
  // ÉTATS GLOBAUX
  // --------------------------------------------------
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // === Sélection globale (rectangle rouge) ===
  const [isDrawingGlobal, setIsDrawingGlobal] = useState(false);
  const [startXGlobal, setStartXGlobal] = useState(0);
  const [startYGlobal, setStartYGlobal] = useState(0);
  const [endXGlobal, setEndXGlobal] = useState(0);
  const [endYGlobal, setEndYGlobal] = useState(0);

  // === Re-run OCR pour un seul jour (rectangle bleu) ===
  const [dayInOcr, setDayInOcr] = useState<string | null>(null);
  const [isDrawingDay, setIsDrawingDay] = useState(false);
  const [startXDay, setStartXDay] = useState(0);
  const [startYDay, setStartYDay] = useState(0);
  const [endXDay, setEndXDay] = useState(0);
  const [endYDay, setEndYDay] = useState(0);

  // === Résultats OCR finaux par jour ===
  const [ocrResults, setOcrResults] = useState<OCRResults>({});

  // === Édition manuelle (jour) ===
  const [editDay, setEditDay] = useState<string | null>(null);
  const [manualIntervals, setManualIntervals] = useState<{ [day: string]: IntervalData[] }>({});

  // === Références ===
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // --------------------------------------------------
  // 1) CHOIX DE FICHIER
  // --------------------------------------------------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log("Aucun fichier sélectionné."); // DEBUG
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    console.log("Nouveau fichier chargé :", file.name); // DEBUG

    // Reset
    setStartXGlobal(0);
    setStartYGlobal(0);
    setEndXGlobal(0);
    setEndYGlobal(0);
    setDayInOcr(null);
    setOcrResults({});
    setEditDay(null);
  };

  // Lorsque l'image est chargée
  const handleImageLoad = () => {
    if (!canvasRef.current || !imgRef.current) return;
    canvasRef.current.width = imgRef.current.width;
    canvasRef.current.height = imgRef.current.height;

    // DEBUG
    console.log(
      "Image dimensions =>",
      imgRef.current.width, "x", imgRef.current.height
    );
  };

  // --------------------------------------------------
  // 2) SÉLECTION GLOBALE (rectangle rouge)
  // --------------------------------------------------
  const handleMouseDownGlobal = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    setIsDrawingGlobal(true);

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStartXGlobal(x);
    setStartYGlobal(y);
    setEndXGlobal(x);
    setEndYGlobal(y);

    console.log("Début sélection globale =>", x, y); // DEBUG
  };

  const handleMouseMoveGlobal = (e: React.MouseEvent) => {
    if (!isDrawingGlobal || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    setEndXGlobal(e.clientX - rect.left);
    setEndYGlobal(e.clientY - rect.top);
  };

  const handleMouseUpGlobal = async () => {
    setIsDrawingGlobal(false);
    console.log("Fin de sélection globale => Lancement OCR 7 colonnes."); // DEBUG

    await ocr7Columns();
  };

  // --------------------------------------------------
  // 3) RE-RUN OCR JOUR (rectangle bleu)
  // --------------------------------------------------
  const handleMouseDownDay = (e: React.MouseEvent) => {
    if (!dayInOcr || !canvasRef.current) return;

    setIsDrawingDay(true);

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStartXDay(x);
    setStartYDay(y);
    setEndXDay(x);
    setEndYDay(y);

    console.log(`Début re-run OCR pour ${dayInOcr} =>`, x, y); // DEBUG
  };

  const handleMouseMoveDay = (e: React.MouseEvent) => {
    if (!dayInOcr || !isDrawingDay || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    setEndXDay(e.clientX - rect.left);
    setEndYDay(e.clientY - rect.top);
  };

  const handleMouseUpDay = async () => {
    setIsDrawingDay(false);

    if (!dayInOcr) return;

    console.log("Fin de sélection bleue => Re-run OCR sur", dayInOcr); // DEBUG
    await ocrOneDay(dayInOcr, startXDay, startYDay, endXDay, endYDay);
    setDayInOcr(null);
  };

  // --------------------------------------------------
  // 4) DESSIN DES RECTANGLES (rouge + bleu)
  // --------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current || !imageUrl) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Effacer
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // rectangle rouge (global)
    const gx = Math.min(startXGlobal, endXGlobal);
    const gy = Math.min(startYGlobal, endYGlobal);
    const gw = Math.abs(endXGlobal - startXGlobal);
    const gh = Math.abs(endYGlobal - startYGlobal);

    if (gw > 0 && gh > 0) {
      ctx.strokeStyle = 'red';
      ctx.setLineDash([6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(gx, gy, gw, gh);
    }

    // rectangle bleu (jour)
    if (dayInOcr) {
      const bx = Math.min(startXDay, endXDay);
      const by = Math.min(startYDay, endYDay);
      const bw = Math.abs(endXDay - startXDay);
      const bh = Math.abs(endYDay - startYDay);

      if (bw > 0 && bh > 0) {
        ctx.strokeStyle = 'blue';
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);
      }
    }
  }, [
    imageUrl,
    isDrawingGlobal, startXGlobal, startYGlobal, endXGlobal, endYGlobal,
    dayInOcr, isDrawingDay, startXDay, startYDay, endXDay, endYDay
  ]);

  // --------------------------------------------------
  // 5) OCR 7 COLONNES (AVEC EXPANSIONS, FUSION, SNAP)
  // --------------------------------------------------
  const ocr7Columns = async () => {
    if (!canvasRef.current || !imgRef.current) {
      console.warn("Canvas ou image non définis. Impossible de lancer l'OCR 7 colonnes."); // DEBUG
      return;
    }

    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;

    // Coordonnées globales sélectionnées
    const x = Math.min(startXGlobal, endXGlobal);
    const y = Math.min(startYGlobal, endYGlobal);
    const w = Math.abs(endXGlobal - startXGlobal);
    const h = Math.abs(endYGlobal - startYGlobal);

    console.log("Zone globale =>", { x, y, w, h }); // DEBUG

    // Largeur de chaque colonne
    const colWidth = w / 7;
    const newResults: OCRResults = {};

    for (let i = 0; i < 7; i++) {
      const dayName = DAYS[i];

      const colX = x + i * colWidth;
      const colY = y;
      const colW = colWidth;
      const colH = h;

      console.log(`OCR => ${dayName} (col n°${i + 1}) :`, { colX, colY, colW, colH }); // DEBUG

      // Extraire la liste d'intervalles
      const intervals = await extractIntervalsWithFusion(
        colX, colY, colW, colH,
        canvasWidth, canvasHeight
      );

      if (intervals.length === 0) {
        newResults[dayName] = 'Traitement incorrect';
      } else {
        newResults[dayName] = intervals.join('\n');
      }
    }

    setOcrResults(newResults);
  };

  // --------------------------------------------------
  // 6) OCR UN SEUL JOUR (BLUE) (AVEC MÊME LOGIQUE)
  // --------------------------------------------------
  const ocrOneDay = async (
    day: string,
    sx: number, sy: number,
    ex: number, ey: number
  ) => {
    if (!canvasRef.current) {
      console.warn("Canvas non défini, impossible de relancer l'OCR pour un jour.");
      return;
    }

    const maxW = canvasRef.current.width;
    const maxH = canvasRef.current.height;

    const x = Math.min(sx, ex);
    const y = Math.min(sy, ey);
    const w = Math.abs(ex - sx);
    const h = Math.abs(ey - sy);

    console.log(`Relance OCR sur le jour "${day}" =>`, { x, y, w, h }); // DEBUG

    const intervals = await extractIntervalsWithFusion(x, y, w, h, maxW, maxH);
    if (intervals.length === 0) {
      setOcrResults((prev) => ({ ...prev, [day]: 'Traitement incorrect' }));
    } else {
      setOcrResults((prev) => ({ ...prev, [day]: intervals.join('\n') }));
    }
  };

  // --------------------------------------------------
  // 7) FONCTION D’EXPANSION + FUSION
  // --------------------------------------------------
  const extractIntervalsWithFusion = async (
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    maxW: number,
    maxH: number
  ): Promise<string[]> => {
    const maxAttempts = 5;
    let attempt = 0;

    // freqMap : { "HH:MM - HH:MM": count }
    const freqMap: Record<string, number> = {};

    // Zone courante
    let currentX = sx;
    let currentY = sy;
    let currentW = sw;
    let currentH = sh;

    while (attempt < maxAttempts) {
      console.log(`Tentative n°${attempt + 1} => zone { x:${currentX}, y:${currentY}, w:${currentW}, h:${currentH} }`); // DEBUG

      // 1) OCR direct sur la zone
      const text = await doOneOcr(currentX, currentY, currentW, currentH);

      console.log("Texte brut OCR =>\n", text); // DEBUG

      // 2) Extraire + snap
      const rawIntervals = parseTimeIntervals(text);  // ex: ["11:02 - 14:07", ...]
      rawIntervals.forEach((raw) => {
        const snapped = snapInterval(raw);  // "11:00 - 14:00"
        freqMap[snapped] = (freqMap[snapped] || 0) + 1;
      });

      // 3) Expansion de 3% si on retente
      const expandFactor = 0.03;
      const addW = currentW * expandFactor;
      const addH = currentH * expandFactor;

      currentX = currentX - addW / 2;
      currentY = currentY - addH / 2;
      currentW = currentW + addW;
      currentH = currentH + addH;

      // Clamp pour éviter de sortir
      if (currentX < 0) currentX = 0;
      if (currentY < 0) currentY = 0;
      if (currentX + currentW > maxW) currentW = maxW - currentX;
      if (currentY + currentH > maxH) currentH = maxH - currentY;

      attempt++;
    }

    // Après 5 tentatives, on récupère les plus fréquents
    const entries = Object.entries(freqMap);  // ex: [ ["11:00 - 14:00", 2], ["10:45 - 13:45", 1] ]

    if (entries.length === 0) {
      console.warn("Aucune intervalle trouvée après 5 tentatives.");
      return [];
    }

    const maxFreq = Math.max(...entries.map(([_, c]) => c));
    const best = entries
      .filter(([_, c]) => c === maxFreq)
      .map(([it]) => it);

    console.log("Intervalles majoritaires =>", best); // DEBUG
    return best;
  };

  // --------------------------------------------------
  // 8) doOneOcr : OCR direct (sans expansions) sur la zone
  // --------------------------------------------------
  const doOneOcr = async (
    sx: number, sy: number,
    sw: number, sh: number
  ): Promise<string> => {
    if (!imgRef.current) {
      console.warn("imgRef.current introuvable => abandon doOneOcr");
      return '';
    }

    // DEBUG
    console.log(`doOneOcr() => x:${sx}, y:${sy}, w:${sw}, h:${sh}`);

    // Canvas temp
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) {
      console.error("Impossible d'obtenir le context 2D du canvas temporaire.");
      return '';
    }

    // On copie la partie de l'image sélectionnée
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, sw, sh);

    // DEBUG : Afficher le canvas temporairement dans la page pour vérifier la zone capturée
    document.body.appendChild(tempCanvas);
    setTimeout(() => {
      if (tempCanvas.parentNode) {
        tempCanvas.parentNode.removeChild(tempCanvas);
      }
    }, 3000);

    // Conversion en base64
    const dataUrl = tempCanvas.toDataURL('image/png');
    const base64Image = dataUrl.replace(/^data:image\/\w+;base64,/, '');

    console.log("Taille base64 =>", base64Image.length, "caractères"); // DEBUG

    // Appel à l'API (OCR.Space)
    const formData = new FormData();
    formData.append('apikey', 'K84197252988957'); // TODO: Remplace par ta clé
    formData.append('language', 'fre');
    formData.append('base64Image', `data:image/png;base64,${base64Image}`);

    try {
      console.log("Envoi requête à l'API OCR.space..."); // DEBUG
      const resp = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData,
      });
      const result = await resp.json();

      console.log("Réponse brute OCR =>", JSON.stringify(result, null, 2)); // DEBUG

      if (!result.ParsedResults || result.ParsedResults.length === 0) {
        console.warn("Aucun ParsedResults =>", result);
        return '';
      }

      return result.ParsedResults[0].ParsedText || '';
    } catch (err) {
      console.error('Erreur OCR =>', err);
      return '';
    }
  };

  // --------------------------------------------------
  // 9) parseTimeIntervals : extraire "HH:MM - HH:MM"
  // --------------------------------------------------
  const parseTimeIntervals = (rawText: string): string[] => {
    // DEBUG
    console.log("parseTimeIntervals => texte OCR à parser =", rawText);

    const regex = /\b([0-2]?\d:[0-5]\d)\s*-\s*([0-2]?\d:[0-5]\d)\b/g;
    const found = rawText.match(regex);
    if (!found) return [];
    return found;
  };

  // --------------------------------------------------
  // 10) snapInterval : ex "14:07 - 17:48" => "14:00 - 17:45"
  // --------------------------------------------------
  const snapInterval = (interval: string): string => {
    const parts = interval.split('-');
    if (parts.length !== 2) return interval;

    const left = parts[0].trim();
    const right = parts[1].trim();

    const leftSnapped = snapTime(left); 
    const rightSnapped = snapTime(right);

    return `${leftSnapped} - ${rightSnapped}`;
  };

  // snapTime => "HH:MM" => minutes arrondies
  const snapTime = (timeStr: string): string => {
    const [hStr, mStr] = timeStr.split(':');
    let hh = parseInt(hStr, 10) || 0;
    let mm = parseInt(mStr, 10) || 0;

    if (hh < 0) hh = 0;
    if (hh > 23) hh = 23;

    mm = nearestQuarter(mm);  // 00,15,30,45
    const hhS = hh.toString().padStart(2, '0');
    const mmS = mm.toString().padStart(2, '0');
    return `${hhS}:${mmS}`;
  };

  // nearestQuarter => 0, 15, 30 ou 45
  const nearestQuarter = (minutes: number): number => {
    const quarters = [0, 15, 30, 45];
    let best = 0;
    let bestDist = 999;
    for (let q of quarters) {
      const dist = Math.abs(q - minutes);
      if (dist < bestDist) {
        bestDist = dist;
        best = q;
      }
    }
    return best;
  };

  // --------------------------------------------------
  // 11) ÉDITION MANUELLE
  // --------------------------------------------------
  const handleOpenDayEdit = (day: string) => {
    setEditDay(day);

    const text = ocrResults[day] || '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    const intervals: IntervalData[] = [];
    lines.forEach((line) => {
      // ex "09:00 - 14:00"
      const match = line.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (match) {
        intervals.push({
          startH: match[1].padStart(2, '0'),
          startM: match[2].padStart(2, '0'),
          endH: match[3].padStart(2, '0'),
          endM: match[4].padStart(2, '0'),
        });
      }
    });

    setManualIntervals((prev) => ({ ...prev, [day]: intervals }));
  };

  const handleCloseDayEdit = () => {
    if (editDay) {
      // Reconstruit
      const intervals = manualIntervals[editDay] || [];
      if (intervals.length === 0) {
        setOcrResults((prev) => ({ ...prev, [editDay]: 'Traitement incorrect' }));
      } else {
        const lines = intervals.map(it => {
          return `${it.startH}:${it.startM} - ${it.endH}:${it.endM}`;
        });
        setOcrResults((prev) => ({ ...prev, [editDay]: lines.join('\n') }));
      }
    }
    setEditDay(null);
  };

  const handleAddInterval = (day: string) => {
    setManualIntervals((prev) => {
      const arr = [...(prev[day] || [])];
      arr.push({ startH: '08', startM: '00', endH: '12', endM: '00' });
      return { ...prev, [day]: arr };
    });
  };

  const handleRemoveInterval = (day: string, idx: number) => {
    setManualIntervals((prev) => {
      const arr = [...(prev[day] || [])];
      arr.splice(idx, 1);
      return { ...prev, [day]: arr };
    });
  };

  const handleIntervalChange = (day: string, idx: number, field: keyof IntervalData, value: string) => {
    setManualIntervals((prev) => {
      const arr = [...(prev[day] || [])];
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...prev, [day]: arr };
    });
  };

  // --------------------------------------------------
  // 12) RE-RUN OCR POUR UN JOUR => active le tracé bleu
  // --------------------------------------------------
  const handleRerunOcrDay = (day: string) => {
    console.log("Re-run OCR sur jour =>", day); // DEBUG
    setDayInOcr(day);
    setStartXDay(0);
    setStartYDay(0);
    setEndXDay(0);
    setEndYDay(0);
  };

  // --------------------------------------------------
  // RENDU
  // --------------------------------------------------
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 10 }}>
      <h1>OCR 7 Colonnes + Expansions + Snap + Re-run & Édition</h1>

      {/* Choix du fichier */}
      <div style={{ marginBottom: 20 }}>
        <input type="file" accept="image/*" onChange={handleFileChange} />
      </div>

      {/* Image + Canvas */}
      {imageUrl && (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Choisie pour OCR"
            onLoad={handleImageLoad}
            style={{ maxWidth: '100%', display: 'block' }}
          />
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', top: 0, left: 0, cursor: 'crosshair' }}
            onMouseDown={(e) => {
              if (dayInOcr) {
                handleMouseDownDay(e);
              } else {
                handleMouseDownGlobal(e);
              }
            }}
            onMouseMove={(e) => {
              if (dayInOcr) {
                handleMouseMoveDay(e);
              } else {
                handleMouseMoveGlobal(e);
              }
            }}
            onMouseUp={(e) => {
              if (dayInOcr) {
                handleMouseUpDay();
              } else {
                handleMouseUpGlobal();
              }
            }}
          />
        </div>
      )}

      {/* Résultats */}
      <div style={{ marginTop: 20 }}>
        {DAYS.map((day) => {
          const text = ocrResults[day] || 'Traitement incorrect';
          const isEditing = (editDay === day);

          return (
            <div key={day} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <strong style={{ marginRight: 8 }}>{day} :</strong>
                {/* Engrenage => ouvre l'édition manuelle */}
                <button
                  style={{ marginRight: 8 }}
                  onClick={() => handleOpenDayEdit(day)}
                  title="Éditer manuellement"
                >
                  ⚙
                </button>
                {/* Re-run OCR => toujours visible */}
                <button
                  style={{ marginRight: 8 }}
                  onClick={() => handleRerunOcrDay(day)}
                  title="Relancer OCR pour ce jour (même logique expansions + snap)"
                >
                  Re-run OCR
                </button>
              </div>

              {/* Afficher le texte OCR */}
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{text}</pre>

              {/* Édition manuelle (sous le jour) */}
              {isEditing && (
                <div style={{
                  marginTop: 10,
                  padding: 10,
                  border: '1px solid #666',
                  background: '#f4f4f4',
                  transition: 'all 0.3s ease',
                }}>
                  <h3>Édition pour {day}</h3>
                  {(manualIntervals[day] || []).map((it, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                      <input
                        type="text"
                        style={{ width: 30, marginRight: 2 }}
                        value={it.startH}
                        onChange={(e) => handleIntervalChange(day, i, 'startH', e.target.value)}
                      />
                      :
                      <input
                        type="text"
                        style={{ width: 30, margin: '0 8px 0 2px' }}
                        value={it.startM}
                        onChange={(e) => handleIntervalChange(day, i, 'startM', e.target.value)}
                      />
                      -
                      <input
                        type="text"
                        style={{ width: 30, marginLeft: 8, marginRight: 2 }}
                        value={it.endH}
                        onChange={(e) => handleIntervalChange(day, i, 'endH', e.target.value)}
                      />
                      :
                      <input
                        type="text"
                        style={{ width: 30, margin: '0 8px 0 2px' }}
                        value={it.endM}
                        onChange={(e) => handleIntervalChange(day, i, 'endM', e.target.value)}
                      />

                      <button onClick={() => handleRemoveInterval(day, i)} style={{ marginLeft: 8 }}>
                        🗑
                      </button>
                    </div>
                  ))}
                  <button onClick={() => handleAddInterval(day)} style={{ marginRight: 10 }}>
                    + Ajouter
                  </button>
                  <button onClick={handleCloseDayEdit}>Terminer</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
