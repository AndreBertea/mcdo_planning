import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Button,
  Image,
  Platform,
  Alert,
  ScrollView,
  TouchableOpacity
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import * as Calendar from 'expo-calendar';
import * as ImageManipulator from 'expo-image-manipulator';
import DateTimePicker from '@react-native-community/datetimepicker';

/////////////////////////////////////
// Composant date picker pour le web
/////////////////////////////////////
function WebDatePicker(props: {
  value: Date;
  onChange: (date: Date) => void;
}) {
  const dateStr = props.value.toISOString().split('T')[0];
  return (
    <input
      type="date"
      value={dateStr}
      style={{ padding: 8, fontSize: 16 }}
      onChange={(event) => {
        const newDate = new Date(event.target.value);
        if (!isNaN(newDate.getTime())) {
          props.onChange(newDate);
        }
      }}
    />
  );
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [ocrTextByDay, setOcrTextByDay] = useState<{ [key: string]: string }>({});
  const [weekStartDate, setWeekStartDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);

  //////////////////////////////////////////////////////////////
  // 1. Sélection d'image et exécution de l'OCR
  //////////////////////////////////////////////////////////////
  const pickImage = async () => {
    if (Platform.OS === 'web') {
      // Sur le web, pas de permissions ; on ouvre un sélecteur de fichiers
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        console.log('Image sélectionnée (web) :', asset.uri);
        setImage(asset.uri);

        // Lancer l'OCR après la sélection
        await performOCR(asset.uri);
      }
    } else {
      // Sur mobile, on demande la permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        Alert.alert('Erreur', "Permission d'accès à la galerie refusée.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        console.log('Image sélectionnée (mobile) :', asset.uri);
        setImage(asset.uri);

        // Lancer l'OCR après la sélection
        await performOCR(asset.uri);
      } else {
        console.log("Sélection d'image annulée.");
      }
    }
  };

  //////////////////////////////////////////////////////////////
  // 2. Manipulation et OCR
  //////////////////////////////////////////////////////////////
  const splitImageIntoColumns = async (imageUri: string): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      Image.getSize(
        imageUri,
        async (width, height) => {
          const columnWidth = width / 7;
          const columnUris: string[] = [];

          for (let i = 0; i < 7; i++) {
            const left = i * columnWidth;
            try {
              const croppedImage = await ImageManipulator.manipulateAsync(
                imageUri,
                [
                  {
                    crop: {
                      originX: left,
                      originY: 0,
                      width: columnWidth,
                      height: height
                    }
                  }
                ],
                { compress: 1, format: ImageManipulator.SaveFormat.PNG }
              );
              columnUris.push(croppedImage.uri);
            } catch (err) {
              reject(err);
            }
          }
          resolve(columnUris);
        },
        (error) => {
          reject(error);
        }
      );
    });
  };

  const performOCR = async (imageUri: string) => {
    try {
      const columnUris = await splitImageIntoColumns(imageUri);

      // Ajuster l'ordre des jours selon votre découpe
      const days = ['Samedi','Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi'];

      let results: { [key: string]: string } = {};

      for (let i = 0; i < columnUris.length; i++) {
        const columnUri = columnUris[i];
        const dayIndex = (i + 1) % 7;
        const day = days[dayIndex];

        let filename = columnUri.split('/').pop() ?? '';
        let match = /\.(\w+)$/.exec(filename);
        let type = match ? `image/${match[1]}` : `image`;

        let formData = new FormData();
        formData.append('file', {
          uri: columnUri,
          name: filename,
          type
        } as any);
        formData.append('language', 'fre');
        formData.append('apikey', 'K84197252988957'); // Votre clé API

        let response = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          body: formData as any
        });

        let result = await response.json();
        if (result.IsErroredOnProcessing) {
          Alert.alert('Erreur OCR', result.ErrorMessage[0]);
          return;
        } else {
          let text = result.ParsedResults[0].ParsedText;
          results[day] = text;
        }
      }

      setOcrTextByDay(results);
      Alert.alert('Succès', 'OCR effectué avec succès.');
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    }
  };

  //////////////////////////////////////////////////////////////
  // 3. Extraction des plages horaires
  //////////////////////////////////////////////////////////////
  const extractSchedules = (textsByDay: { [key: string]: string }) => {
    let results: { [key: string]: string[] } = {};
    const regexTimeInterval = /\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}/g;

    for (let day in textsByDay) {
      const text = textsByDay[day];
      let matches = text.match(regexTimeInterval);
      if (matches) {
        let intervals = matches.map((m) =>
          m.replace('.', ':').replace('–', '-').trim()
        );
        results[day] = intervals;
      } else {
        results[day] = ['Aucun'];
      }
    }
    return results;
  };

  //////////////////////////////////////////////////////////////
  // 4. Création d'événements
  //////////////////////////////////////////////////////////////

  // 4a. Sur MOBILE : utilisation de expo-calendar
  const createEventsMobile = async (schedules: { [key: string]: string[] }) => {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Erreur', "Permission d'accéder au calendrier refusée.");
      return;
    }

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const defaultCalendar = calendars.find((cal) => cal.allowsModifications);

    if (!defaultCalendar) {
      Alert.alert('Erreur', 'Aucun calendrier modifiable trouvé.');
      return;
    }

    // Mapping jour -> index
    const daysMapping: { [key: string]: number } = {
      Lundi: 0,
      Mardi: 1,
      Mercredi: 2,
      Jeudi: 3,
      Vendredi: 4,
      Samedi: 5,
      Dimanche: 6
    };

    for (let day in schedules) {
      let intervals = schedules[day];
      intervals.forEach(async (interval) => {
        if (interval !== 'Aucun') {
          let [startStr, endStr] = interval.split(/[-–]/).map((s) =>
            s.trim().replace('.', ':')
          );
          let [startHour, startMinute] = startStr.split(':').map(Number);
          let [endHour, endMinute] = endStr.split(':').map(Number);

          let eventDate = new Date(weekStartDate);
          if (day in daysMapping) {
            eventDate.setDate(eventDate.getDate() + daysMapping[day]);
          }

          let startDate = new Date(eventDate);
          startDate.setHours(startHour, startMinute);

          let endDate = new Date(eventDate);
          endDate.setHours(endHour, endMinute);

          try {
            await Calendar.createEventAsync(defaultCalendar.id, {
              title: 'Travail',
              startDate,
              endDate,
              timeZone: Calendar.DEFAULT
            });
          } catch (error) {
            console.error("Erreur lors de la création de l'événement", error);
          }
        }
      });
    }

    Alert.alert('Succès', 'Les événements ont été ajoutés à votre calendrier mobile.');
  };

  // 4b. Sur WEB : génération d'un fichier .ics
  const createEventsWeb = async (schedules: { [key: string]: string[] }) => {
    // Construire la chaîne ICS
    let icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//HoraireApp//FR
CALSCALE:GREGORIAN
METHOD:PUBLISH
`;

    const daysMapping: { [key: string]: number } = {
      Lundi: 0,
      Mardi: 1,
      Mercredi: 2,
      Jeudi: 3,
      Vendredi: 4,
      Samedi: 5,
      Dimanche: 6
    };

    // Helper pour formater la date en ICS (UTC ou local)
    const formatICSDate = (date: Date) => {
      // Ex: 20250120T180000
      // Ici on fait local, sans fuseau. Pour un usage plus abouti, on pourrait passer en UTC + 'Z'.
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const ss = '00'; // on fixe à 00
      return `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
    };

    // Pour chaque jour + interval
    for (let day in schedules) {
      let intervals = schedules[day];
      intervals.forEach((interval) => {
        if (interval !== 'Aucun') {
          let [startStr, endStr] = interval.split(/[-–]/).map((s) =>
            s.trim().replace('.', ':')
          );
          let [startHour, startMinute] = startStr.split(':').map(Number);
          let [endHour, endMinute] = endStr.split(':').map(Number);

          // Calcul de la date
          let eventDate = new Date(weekStartDate);
          if (day in daysMapping) {
            eventDate.setDate(eventDate.getDate() + daysMapping[day]);
          }

          let startDate = new Date(eventDate);
          startDate.setHours(startHour, startMinute);
          let endDate = new Date(eventDate);
          endDate.setHours(endHour, endMinute);

          // Construire l'événement ICS
          icsContent += `BEGIN:VEVENT
UID:${Math.random()}@horaireapp
SUMMARY:Travail
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
END:VEVENT
`;
        }
      });
    }

    icsContent += 'END:VCALENDAR';

    // Générer un blob et le proposer au téléchargement
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'mon-horaire.ics';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    alert('Fichier ICS généré et téléchargé.');
  };

  // 4c. Méthode unifiée quand on clique sur "Créer les événements"
  const handleCreateEventsPress = () => {
    if (Object.keys(ocrTextByDay).length === 0 || !weekStartDate) {
      Alert.alert('Erreur', "Veuillez sélectionner une image et la date de début de semaine.");
      return;
    }
    let schedules = extractSchedules(ocrTextByDay);

    if (Platform.OS === 'web') {
      // Sur web, on génère un fichier ICS
      createEventsWeb(schedules);
    } else {
      // Sur mobile, on crée directement dans le calendrier
      createEventsMobile(schedules);
    }
  };

  //////////////////////////////////////////////////////////////
  // 5. Rendu principal
  //////////////////////////////////////////////////////////////
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topSpacing} />

        {/* Sélection de la date de début de semaine */}
        <Text style={styles.label}>Date de début de la semaine :</Text>

        {Platform.OS === 'web' ? (
          // Sur web, on affiche un <input type="date" />
          <WebDatePicker
            value={weekStartDate}
            onChange={(newDate) => setWeekStartDate(newDate)}
          />
        ) : (
          // Sur mobile, le bouton ouvre DateTimePicker
          <>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.datePickerText}>
                {weekStartDate
                  ? weekStartDate.toLocaleDateString()
                  : 'Sélectionnez la date'}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={weekStartDate || new Date()}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) {
                    setWeekStartDate(selectedDate);
                  }
                }}
              />
            )}
          </>
        )}

        <View style={{ height: 20 }} />

        {/* Sélection de l'image */}
        <Button title="Sélectionner une image" onPress={pickImage} />

        {/* Affichage de l'image */}
        {image && (
          <Image
            source={{ uri: image }}
            style={styles.image}
            resizeMode="contain"
          />
        )}

        {/* Affichage du texte OCR */}
        {Object.keys(ocrTextByDay).length > 0 && (
          <View style={styles.ocrResults}>
            {Object.entries(ocrTextByDay).map(([day, text]) => (
              <View key={day} style={styles.dayContainer}>
                <Text style={styles.dayTitle}>{day} :</Text>
                <Text style={styles.dayText}>{text}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bouton pour créer les événements (mobile) ou générer .ics (web) */}
      <View style={styles.createButtonContainer}>
        <Button title="Créer les événements" onPress={handleCreateEventsPress} />
      </View>
    </View>
  );
}

//////////////////////////////////////////////////////////////
// Styles
//////////////////////////////////////////////////////////////
const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  scrollContent: {
    paddingTop: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    paddingBottom: 80
  },
  topSpacing: {
    height: 40
  },
  label: {
    fontSize: 18,
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  datePickerButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginBottom: 20,
    width: '100%'
  },
  datePickerText: {
    fontSize: 16
  },
  image: {
    width: '100%',
    height: 200,
    marginVertical: 20
  },
  ocrResults: {
    width: '100%'
  },
  dayContainer: {
    marginBottom: 15
  },
  dayTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 5
  },
  dayText: {
    fontSize: 14,
    color: '#333'
  },
  createButtonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20
  }
});