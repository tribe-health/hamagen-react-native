import BackgroundFetch from 'react-native-background-fetch';
import AsyncStorage from '@react-native-community/async-storage';
import moment from 'moment';
import config, { initConfig } from '../config/config';
import { checkGeoSickPeople, checkBLESickPeople } from './Tracker';
import { onError } from './ErrorService';
import { LAST_FETCH_TS, SERVICE_TRACKER } from '../constants/Constants';

export const scheduleTask = async () => {
  try {
    BackgroundFetch.configure(
      {
        minimumFetchInterval: config().fetchMilliseconds / 60000,
        // Android options
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true
      },
      async () => {
        try {
          console.log('Background fetch event fired');

          const res = JSON.parse(await AsyncStorage.getItem(SERVICE_TRACKER) || '[]');
          await AsyncStorage.setItem(SERVICE_TRACKER, JSON.stringify([...res, { source: 'checkSickPeople - background', timestamp: moment().valueOf() }]));

          await initConfig();
          
          await checkBLESickPeople();
          await checkGeoSickPeople();
          
          await AsyncStorage.setItem(
            LAST_FETCH_TS,
            JSON.stringify(new Date().getTime()),
          );
          BackgroundFetch.finish(BackgroundFetch.FETCH_RESULT_NEW_DATA);
        } catch (error) {
          onError({ error });
        }
      },
      (error: any) => onError({ error })
    );
  } catch (error) {
    onError({ error });
  }
};
