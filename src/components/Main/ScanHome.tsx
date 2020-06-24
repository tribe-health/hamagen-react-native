import React, { useEffect, useRef, useState, FunctionComponent } from 'react';
import { View, StyleSheet, AppState, AppStateStatus, BackHandler, DeviceEventEmitter, Linking } from 'react-native';
import { connect } from 'react-redux';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import moment from 'moment';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { RESULTS } from 'react-native-permissions';
import SplashScreen from 'react-native-splash-screen';

// @ts-ignore
import RNSettings from 'react-native-settings';
import ScanHomeHeader from './ScanHomeHeader';
import NoExposures from './NoExposures';
import { checkForceUpdate, checkIfHideLocationHistory, showMapModal, checkIfBleEnabled } from '../../actions/GeneralActions';
import { checkLocationPermissions, goToFilterDrivingIfNeeded } from '../../services/LocationService';
import { syncLocationsDBOnLocationEvent } from '../../services/SampleService';
import { onOpenedFromDeepLink } from '../../services/DeepLinkService';
import { ExternalUrls, Languages, Strings } from '../../locale/LocaleData';
import { Exposure } from '../../types';
import NoGPS from './NoGPS';
import NoNetwork from './NoNetwork';
import { logStartToFile } from '../../services/LogService';


interface ScanHomeProps {
  navigation: DrawerNavigationProp<any, 'ScanHome'>,
  route: RouteProp<any, 'ScanHome'>,
  isRTL: boolean,
  strings: Strings,
  locale: string,
  languages: Languages,
  externalUrls: ExternalUrls,
  exposures: Exposure[],
  pastExposures: Exposure[],
  enableBle: boolean | undefined,
  firstPoint?: number,
  enableBle: boolean | undefined,
  hideLocationHistory: boolean,
  checkForceUpdate(): void,
  checkIfHideLocationHistory(): void,
  showMapModal(exposure: Exposure): void,
  checkIfBleEnabled(): void
}

// user has Relevant event by time and location
const isAfter14Days = ({ properties }: Exposure): boolean => ((properties?.wasThere && moment().diff(moment(properties.toTime ?? properties.BLETimestamp), 'days') < 14) ?? false);

const ScanHome: FunctionComponent<ScanHomeProps> = (
  {
    navigation,
    route,
    isRTL,
    strings,
    locale,
    languages,
    externalUrls,
    exposures,
    pastExposures,
    firstPoint,
    enableBle,
    hideLocationHistory,
    checkForceUpdate,
    checkIfHideLocationHistory,
    checkIfBleEnabled
  }
) => {
  const shown = useRef(null);
  const appStateStatus = useRef<AppStateStatus>('active');
  const [{ hasLocation, hasNetwork, hasGPS }, setIsConnected] = useState({ hasLocation: true, hasNetwork: true, hasGPS: true });

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (shown.current) {
      SplashScreen.hide();
    }
  }, [shown.current]);

  const init = async () => {
    checkConnectionStatusOnLoad();
    checkIfHideLocationHistory();
    checkIfBleEnabled();

    if (exposures.length > 0) {
      navigation.navigate('ExposureDetected');
    } else {
      checkForceUpdate();

      await goToFilterDrivingIfNeeded(navigation);

      const url = await Linking.getInitialURL();


      if (url) {
        return onOpenedFromDeepLink(url, navigation);
      }

      await syncLocationsDBOnLocationEvent();
    }
    logStartToFile('app load end');
  };

  useEffect(() => {
    AppState.addEventListener('change', onAppStateChange);
    NetInfo.addEventListener((state: NetInfoState) => setIsConnected({ hasLocation, hasNetwork: state.isConnected, hasGPS }));
    DeviceEventEmitter.addListener(RNSettings.GPS_PROVIDER_EVENT, handleGPSProviderEvent);

    return () => {
      AppState.removeEventListener('change', onAppStateChange);
      DeviceEventEmitter.removeListener(RNSettings.GPS_PROVIDER_EVENT, handleGPSProviderEvent);
    };
  }, [hasLocation, hasNetwork, hasGPS]);

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        BackHandler.exitApp();
        return true;
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, [])
  );

  const checkConnectionStatusOnLoad = async () => {
    const locationPermission = await checkLocationPermissions();
    const networkStatus = await NetInfo.fetch();
    const GPSStatus = await RNSettings.getSetting(RNSettings.LOCATION_SETTING);

    setIsConnected({ hasLocation: locationPermission === RESULTS.GRANTED, hasNetwork: networkStatus.isConnected, hasGPS: GPSStatus === RNSettings.ENABLED });
  };

  const onAppStateChange = async (state: AppStateStatus) => {
    if (state === 'active' && appStateStatus.current !== 'active') {
      checkIfHideLocationHistory();

      const locationPermission = await checkLocationPermissions();
      const GPSStatus = await RNSettings.getSetting(RNSettings.LOCATION_SETTING);
      const networkStatus = await NetInfo.fetch();

      setIsConnected({ hasLocation: locationPermission === RESULTS.GRANTED, hasNetwork: networkStatus.isConnected, hasGPS: GPSStatus === RNSettings.ENABLED });
    }

    appStateStatus.current = state;
  };

  const handleGPSProviderEvent = (e: any) => {
    setIsConnected({ hasLocation, hasNetwork, hasGPS: e[RNSettings.LOCATION_SETTING] === RNSettings.ENABLED });
  };
  

  const exposureState = () => {
    // user never got any exposure detected
    if (exposures.length + pastExposures.length === 0) {
      return 'pristine';
    }

    // check if user past exposures are relevant
    // ie: is less then 14 days old
    if (exposures.some(isAfter14Days) || pastExposures.some(isAfter14Days)) {
      return 'relevant';
    }

    return 'notRelevant';
  };


  const RelevantState = () => {
    if (!hasGPS || !hasLocation) return (<NoGPS {...strings.scanHome.noGPS} />);
    if (!hasNetwork) return (<NoNetwork {...strings.scanHome.noNetwork} />);
    return (
      <NoExposures
        isRTL={isRTL}
        strings={strings}
        firstPoint={firstPoint}
        exposureState={exposureState()}
        hideLocationHistory={hideLocationHistory}
        enableBle={enableBle}
        locale={locale}
        languages={languages}
        externalUrls={externalUrls}
        goToLocationHistory={() => navigation.navigate('LocationHistory')}
        goToBluetoothPermission={() => navigation.navigate('Bluetooth')}
        showBleInfo={route.params?.showBleInfo}
      />
    );
  };

  return (
    <View style={styles.container} ref={shown}>
      <ScanHomeHeader
        languages={languages}
        isRTL={isRTL}
        locale={locale}
        externalUrls={externalUrls}
        strings={strings}
        openDrawer={navigation.openDrawer}
      />
      {RelevantState()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  }
});

const mapStateToProps = (state: any) => {
  const {
    locale: { isRTL, strings, locale, languages, externalUrls },
    general: { hideLocationHistory, enableBle },
    exposures: { exposures, pastExposures, validExposure, firstPoint }
  } = state;

  return { isRTL, strings, locale, languages, externalUrls, exposures, pastExposures, validExposure, firstPoint, hideLocationHistory, enableBle };
};


export default connect(mapStateToProps, {
  checkForceUpdate,
  checkIfHideLocationHistory,
  showMapModal,
  checkIfBleEnabled
})(ScanHome);
