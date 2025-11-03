/* eslint-disable prettier/prettier */
// /* eslint-disable prettier/prettier */
// import { Injectable, ConflictException, NotFoundException, UnauthorizedException, BadRequestException,} from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { FindManyOptions, Like, Not, Repository} from 'typeorm';
// import * as bcrypt from 'bcrypt';
// import { HttpService } from '@nestjs/axios';
// import { User, UserRole } from './entities/user.entity';
// import { JwtService } from '@nestjs/jwt';
// import { ConfigService } from '@nestjs/config';
// import { CreateAuthDto, CreateAuthDtoDriver, LoginAuthDto } from './dto/create-auth.dto';
// import { UpdateAuthDto } from './dto/update-auth.dto';
// import { DiverLicense } from './entities/license.entity';
// import { Nin, RiderType } from './entities/nin';
// import axios from 'axios';
// import { LocationDrive } from '../trip/entities/location_drive';
// import { Vehicle } from './entities/vehicle.entity';
// import { CreateVehicleDto } from './dto/vehicle.dto';
// import * as AWS from 'aws-sdk';
// import { ProfileImage } from './entities/profile.entity';
// import * as path from 'path';
// import { plateNum } from './entities/plateNum.entity';
// import { LicenseImg } from './entities/licenseImg.entity';
// import { VehicleReg } from './entities/VehicleReg.entity';
// import { Ride } from 'src/rides/entities/ride.entity';

// @Injectable()
// export class AuthService {
//   private readonly apiUrl: string;
//   private s3: AWS.S3;
//   private bucketName: string;

//   constructor(
//     @InjectRepository(User)
//     private readonly userRepository: Repository<User>,
//     @InjectRepository(DiverLicense)
//     private licenseRepository: Repository<DiverLicense>,
//     @InjectRepository(Nin)
//     private ninRepository: Repository<Nin>,
//     @InjectRepository(LocationDrive)
//     private locationDriveRepository: Repository<LocationDrive>,
//     @InjectRepository(Vehicle)
//     private vehicleRepository: Repository<Vehicle>,
//     @InjectRepository(ProfileImage)
//     private readonly profileImageRepository: Repository<ProfileImage>,
//     @InjectRepository(plateNum)
//     private readonly plateImageRepository: Repository<plateNum>,
//     @InjectRepository(LicenseImg)
//     private readonly licenseImageRepository: Repository<LicenseImg>,
//     @InjectRepository(VehicleReg)
//     private readonly vehicleRegImageRepository: Repository<VehicleReg>,
//     @InjectRepository(Ride)
//     private rideRepository: Repository<Ride>,

//     private readonly jwtService: JwtService,
//     private readonly configService: ConfigService,
//     private readonly httpService: HttpService,

//   ) {
//       // Initialize apiUrl from config
//       this.apiUrl = this.configService.get<string>('API_URL');
//        // Set bucket
//     // this.s3 = new AWS.S3({
//     //   endpoint: process.env.LINODE_BUCKET_ENDPOINT, // Linode bucket endpoint
//     //   accessKeyId: process.env.LINODE_ACCESS_KEY, // Access key
//     //   secretAccessKey: process.env.LINODE_SECRET_KEY, // Secret key
//     //   region: process.env.LINODE_BUCKET_REGION, // Bucket region
//     //   s3ForcePathStyle: true, // Linode-specific setting
//     // });
//      this.s3 = new AWS.S3({
//       endpoint: 'https://us-southeast-1.linodeobjects.com',
//       region: 'us-southeast-1',
//       accessKeyId: 'TZDQ6OXF5EVG189VJ80R',
//       secretAccessKey: 'fcmd8yYuHeFOKja3QXcm6DyCTeRe9WglTfMWJJJX',
//       signatureVersion: 'v4',
//     });

//     this.bucketName = process.env.LINODE_BUCKET_NAME; // Set bucket name
//   }

//   async uploadFileToLinode(file: Express.Multer.File): Promise<string> {
//     const params = {
//       Bucket: this.bucketName,
//       Key: `${Date.now()}-${file.originalname}`, // Unique filename
//       Body: file.buffer, // File content
//       ContentType: file.mimetype, // Set content type (e.g., image/jpeg)
//       ACL: 'public-read', // Make the file publicly accessible
//     };

//     try {
//       const uploadResult = await this.s3.upload(params).promise();
//       return uploadResult.Location; // Return the URL of the uploaded file
//     } catch (error) {
//       // console.error('Linode Upload Error:', error); // 👈 Add this
//       throw new BadRequestException('Error uploading file to Linode Object Storage',error);
//     }
//   }

//   async createUser(createUserDto: CreateAuthDto): Promise<User> {
//     const { email, phoneNumber, password, fname, lname, role } = createUserDto;

//     // Check if email or phone number already exists
//     const existingUser = await this.userRepository.findOne({
//       where: [{ email }, { phoneNumber }]
//     });
//     if (existingUser) {
//       throw new ConflictException(
//         'A user with this email or phone number already exists.',
//       );
//     }

//     // Hash the password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Create and save the user
//     const user = this.userRepository.create({
//       email,
//       phoneNumber,
//       password: hashedPassword,
//       fname,
//       lname,
//       role
//     });
//     return this.userRepository.save(user);
//   }

//   async login(loginAuthDto: LoginAuthDto): Promise<{ accessToken: string; refreshToken: string; user: Partial<User> }> {
//     const { email, password } = loginAuthDto;

//     // Find user by email
//     const user = await this.userRepository.findOne({ where: { email } });
//     if (!user) {
//       throw new UnauthorizedException('Invalid email or password');
//     }

//     // Compare passwords
//     const isPasswordValid = await bcrypt.compare(password, user.password);
//     if (!isPasswordValid) {
//       throw new UnauthorizedException('Invalid email or password');
//     }

//     // Create payloads
//     const payload = { email: user.email, sub: user.id };
//     const rolePayload = { role: user.role, sub: user.id };

//     // Generate tokens
//     const accessToken = await this.jwtService.signAsync(payload, {
//       expiresIn: '1d',
//       secret: this.configService.get<string>('ACCESS_TOKEN'),
//     });

//     const refreshToken = await this.jwtService.signAsync(payload, {
//       expiresIn: '7d',
//       secret: this.configService.get<string>('REFRESH_TOKEN')
//     });

//     // Return access token and user details (excluding password)
//     const { password: _, ...userDetails } = user; // Omit password from returned user object

//     return { accessToken, refreshToken, user: userDetails };
//   }

//   async findAll(): Promise<User[]> {
//     const users = await this.userRepository.find({
//       relations: ['card', 'driverLicense', 'nin', 'vehicle', 'location_drive','vehicle_reg_image','Profile_img','plateNum_img','licenseImg','orders','orders.cashPayments','orders.paymentDetails','trips'], // include all needed relations
//     });

//     if (users.length === 0) {
//       throw new NotFoundException('No users found.');
//     }

//     return users;
//   }

//   async findOne(id): Promise<User> {
//     const user = await this.userRepository.findOne({
//       where: { id },
//       relations: ['card', 'driverLicense', 'nin','vehicle','location_drive','vehicle_reg_image','Profile_img','plateNum_img','licenseImg','orders','orders.cashPayments','orders.paymentDetails','trips'], // Include related entities
//     });

//     if (!user) {
//       throw new NotFoundException(`User with ID ${id} not found.`);
//     }

//     return user;
//   }
//   async findOneByEmail(email: string): Promise<User> {
//     const user = await this.userRepository.findOne({
//       where: { email },  // Find by email, not by UUID
//       relations: ['card', 'driverLicense', 'nin', 'vehicle'],
//     });

//     if (!user) {
//       throw new NotFoundException(`User with email ${email} not found.`);
//     }

//     return user;
//   }

//   async update(id: string, updateAuthDto: UpdateAuthDto): Promise<User> {
//     const user = await this.findOne(id);

//     Object.assign(user, updateAuthDto);
//     return this.userRepository.save(user);
//   }

//   async remove(id: string): Promise<void> {
//     const user = await this.findOne(id);
//     await this.userRepository.remove(user);
//   }

//   async countUsers(): Promise<number> {
//     try {
//       return await this.userRepository.count();
//     } catch (error) {
//       // console.error('Error counting users:', error);
//       throw error;
//     }
//   }

//   async findAllUsers(query: {
//     page?: number;
//     limit?: number;
//     search?: string;
//   }): Promise<{ data: User[]; total: number }> {
//     const { page = 1, limit = 10, search = '' } = query;

//     // Build options for filtering and pagination
//     const options: FindManyOptions<User> = {
//       where: search
//         ? [
//             { email: Like(`%${search}%`) },
//             { fname: Like(`%${search}%`) },
//             { lname: Like(`%${search}%`) }
//           ]
//         : undefined,
//       skip: (page - 1) * limit, // Pagination offset
//       take: limit // Limit the number of records
//     };

//     // Retrieve data and total count
//     const [data, total] = await this.userRepository.findAndCount(options);

//     return { data, total };
//   }
//   async changePassword(userId, oldPassword:string, newPassword: string): Promise<string> {
//     // Fetch the user by ID
//     const user = await this.userRepository.findOne({ where: { id: userId } });

//     if (!user) {
//       throw new NotFoundException('User not found');
//     }

//     // Verify the old password
//     const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
//     if (!isPasswordValid) {
//       throw new BadRequestException('Incorrect old password');
//     }

//     // Hash the new password
//     const hashedNewPassword = await bcrypt.hash(newPassword, 10);

//     // Update the user's password
//     user.password = hashedNewPassword;
//     await this.userRepository.save(user);

//     return 'Password changed successfully';
//   }

//   async createUserDriver(createUserDto: CreateAuthDtoDriver): Promise<User> {
//     const { email, phoneNumber, password, fname, lname, role, drive_country, drive_city } = createUserDto;

//     // Check if email or phone number already exists
//     const existingUser = await this.userRepository.findOne({
//       where: [{ email }, { phoneNumber }]
//     });
//     if (existingUser) {
//       throw new ConflictException(
//         'A user with this email or phone number already exists.',
//       );
//     }

//     // Hash the password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Create and save the user
//     const user = this.userRepository.create({
//       email,
//       phoneNumber,
//       password: hashedPassword,
//       fname,
//       lname,
//       role
//     });
//     const savedUser = await this.userRepository.save(user);

//     // Create and save the location details if provided
//     if (drive_country || drive_city) {
//       const location = this.locationDriveRepository.create({
//         drive_country,
//         drive_city,
//         user: savedUser
//       });
//       await this.locationDriveRepository.save(location);
//       savedUser.location_drive = location;
//     }

//     return savedUser;
//   }

//   async updateOrCreateUser(userData: any) {
//     let user = null;

//     // Check if user already exists based on email
//     if (userData.email) {
//       user = await this.userRepository.findOne({
//         where: [{ email: userData.email }, { phoneNumber: userData.phoneNumber }],
//         relations: ['nin', 'driverLicense'], // Load related entities
//       });
//     }

//     if (user) {

//       if (user.isRider) {

//         throw new BadRequestException('User is already registered as a rider or driver');

//       }

//       if (userData.nin) {
//         const ninData = await this.getNinDetails(userData.nin);
//         const nin = user.nin || this.ninRepository.create();

//         Object.assign(nin, {
//           birthDate: ninData.birthDate,
//           gender: ninData.gender,
//           riderType: RiderType.RIDER,
//           employmentStatus: ninData.employmentStatus,
//           trackingId: ninData.trackingId,
//           residenceAdressLine1: ninData.residenceAdressLine1,
//           telephoneNo: ninData.telephoneNo,
//           user: user,
//         });

//         user.nin = await this.ninRepository.save(nin);

//       } else if (userData.licenseNo) {

//         const driverData = await this.getDriverLicenseDetails(userData.licenseNo);

//         if (!driverData) {

//           throw new BadRequestException("Driver's license details could not be retrieved.");

//         }

//         const driver = user.driverLicense || this.licenseRepository.create();
//         // console.log(driverData,11);
//         Object.assign(driver, {
//           licenseNo: driverData.licenseNo,
//           birthdate: driverData.birthdate,
//           gender: driverData.gender,
//           issuedDate: driverData.issuedDate,
//           expiryDate: driverData.expiryDate,
//           stateOfIssue: driverData.stateOfIssue,
//           user: user,
//         });

//         user.driverLicense = await this.licenseRepository.save(driver);
//       } else {
//         throw new BadRequestException("User must provide either NIN or Driver's License");
//       }

//       user.isRider = true;
//       await this.userRepository.save(user);

//       return this.formatUserResponse(user);
//     }

//     // If user doesn't exist, create a new user
//     if (!userData.nin && !userData.licenseNo) {
//       throw new BadRequestException("User must provide either NIN or Driver's License");
//     }

//     if (userData.nin && userData.licenseNo) {
//       throw new BadRequestException("User cannot have both NIN and Driver's License");
//     }

//     let newUser;

//     if (userData.nin) {
//       const ninData = await this.getNinDetails(userData.nin);
//       const hashed = await bcrypt.hash(userData.password, 10);
//       newUser = this.userRepository.create({
//         phoneNumber: userData.phoneNumber,
//         fname: ninData.firstName,
//         lname: ninData.middleName,
//         email: userData.email,
//         password: hashed,
//         role: UserRole.CUSTOMER,
//         isRider: true,
//       });

//       newUser = await this.userRepository.save(newUser);

//       const nin = this.ninRepository.create({
//         birthDate: ninData.birthDate,
//         gender: ninData.gender,
//         riderType: RiderType.RIDER,
//         employmentStatus: ninData.employmentStatus,
//         trackingId: ninData.trackingId,
//         residenceAdressLine1: ninData.residenceAdressLine1,
//         telephoneNo: ninData.telephoneNo,
//         user: newUser,
//       });

//       newUser.nin = await this.ninRepository.save(nin);
//     } else if (userData.licenseNo) {
//       const driverData = await this.getDriverLicenseDetails(userData.licenseNo);
//       if (!driverData) {
//         throw new BadRequestException("Driver's license details could not be retrieved.");
//       }
//       // console.log(driverData,2);
//       const hashed = await bcrypt.hash(userData.password, 10);
//       newUser = this.userRepository.create({
//         phoneNumber: userData.phoneNumber,
//         fname: driverData.firstname,
//         lname: driverData.lastname,
//         email: userData.email,
//         password: hashed,
//         role: UserRole.CUSTOMER,
//         isRider: true,
//       });
//       // console.log(driverData, 3);

//       newUser = this.userRepository.create({
//         phoneNumber: userData.phoneNumber,
//         fname: driverData.firstname,
//         lname: driverData.lastname,
//         email: userData.email,
//         password: hashed,
//         role: UserRole.CUSTOMER,
//         isRider: true,
//       });

//       // Save the user first so it gets an ID
//       newUser = await this.userRepository.save(newUser);

//       // console.log(driverData, 4);

//       // Check if this user already has a DriverLicense
//       const existingDriver = await this.licenseRepository.findOne({
//         where: { user: newUser },
//       });

//       if (existingDriver) {
//         throw new Error("This user already has a driver license.");
//       }

//       // Create a new driver license
//       const driver = this.licenseRepository.create({
//         licenseNo: driverData.licenseNo,
//         birthdate: driverData.birthdate,
//         gender: driverData.gender,
//         issuedDate: driverData.issuedDate,
//         expiryDate: driverData.expiryDate,
//         stateOfIssue: driverData.stateOfIssue,
//         user: newUser, // Now, newUser is saved and has an ID
//       });

//       // Save the driver license
//       await this.licenseRepository.save(driver);

//       // Update newUser with the driver reference (if needed)
//       newUser.driverLicense = driver;
//       await this.userRepository.save(newUser);

//     }

//     return this.formatUserResponse(newUser);
//   }
//   private formatUserResponse(user: User) {
//     return {
//       id: user.id,
//       phoneNumber: user.phoneNumber,
//       email: user.email,
//       role: user.role,
//       isRider: user.isRider,
//       fname:user.fname,
//       lname:user.lname,
//       nin: user.nin ? { trackingId: user.nin.trackingId, birthDate: user.nin.birthDate } : null,
//       driver: user.driverLicense ? { licenseNo: user.driverLicense.licenseNo , birthdate:user.driverLicense.birthdate} : null,
//     };
//   }

// async getNinDetails(nin: string) {
//   try {
//     const response = await this.httpService.axiosRef.get(
//       `https://api.dikript.com/dikript/test/api/v1/getnin?nin=${nin}`,
//       { headers: { 'x-api-key': process.env.NIN_VER } }
//     );

//     // Check if the API response is successful and contains valid data
//     if (response.data?.status === true && response.data?.data) {
//       return response.data.data;
//     } else {
//       throw new BadRequestException(response.data?.error?.message || 'Failed to fetch NIN details');
//     }
//   } catch (error) {
//     // console.error('Error fetching NIN details:', error.message);
//     throw new BadRequestException('Error retrieving NIN details. Please try again later.',error);
//   }
// }

// async getDriverLicenseDetails(licenseNo: string) {
//   try {
//     const response = await this.httpService.axiosRef.get(
//       `https://api.dikript.com/dikript/test/api/v1/getfrsc?frsc=${licenseNo}`,
//       { headers: { 'x-api-key': process.env.BVN_VER } }
//     );

//     // Check if the API response is successful and contains valid data
//     if (response.data?.status === true && response.data?.data) {
//       return response.data.data;
//     } else {
//       throw new BadRequestException(response.data?.error?.message || 'Failed to fetch Driver License details');
//     }
//   } catch (error) {
//     // console.error('Error fetching Driver License details:', error.message);
//     throw new BadRequestException('Error retrieving Driver License details. Please try again later.',error);
//   }
// }

// async getDrivers() {
//   // Query users where isRider is true and they have a driverLicense
//   const drivers = await this.userRepository.find({
//     where: {
//       isRider: true
//     },
//     relations: ['driverLicense','nin','vehicle','location_drive','vehicle_reg_image','Profile_img','plateNum_img','licenseImg','trips','rides','drivenRides','driverEarnings'], // Load the driver's license details
//   });

//   return drivers
// }
// async getDriverById(driverId) {
//   // Find the user by id and ensure they are a driver
//   const driver = await this.userRepository.findOne({
//     where: {
//       id: driverId,
//       isRider: true
//     },
//     relations: ['driverLicense','nin','vehicle','location_drive','vehicle_reg_image','Profile_img','plateNum_img','licenseImg','trips','rides','drivenRides','driverEarnings'], // Load the driver's license details
//   });

//   if (!driver) {
//     throw new NotFoundException('Driver not found or user is not a driver');
//   }

//   return driver
// }

// async findAvailableDrivers() {
//   const availableDrivers = await this.userRepository
//     .createQueryBuilder('user')
//     .leftJoinAndSelect('user.drivenRides', 'ride') // join with drivenRides to check for ongoing rides
//     .where('user.isRider = :isRider', { isRider: true }) // only drivers or riders
//     .andWhere('ride.status IS NULL OR ride.status != :status', { status: 'accepted' }) // not on an active trip
//     .getMany();

//   return availableDrivers;
// }
// async getCarBrands(): Promise<any> {
//   try {
//     const response = await axios.get(
//       'https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=json',
//     );
//     return response.data.Results; // contains array of car brands
//   } catch (error) {
//     throw new Error(`Error fetching car brands: ${error.message}`);
//   }
// }

//   async getCarModels(make: string): Promise<any> {
//     const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/${make}?format=json`;

//     try {
//       const response = await axios.get(url);
//       return response.data;
//     } catch (error) {
//       throw new Error(`Error fetching car models: ${error.message}`);
//     }
//   }

//     async getCarModelDetails(make: string, model: string): Promise<any> {
//       const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/${make}?format=json`;

//       try {
//         const response = await axios.get(url);

//         const filteredModels = response.data.Results.filter(
//           (m: any) => m.Model_Name.toLowerCase() === model.toLowerCase()
//         );

//         return {
//           count: filteredModels.length,
//           results: filteredModels,
//         };
//       } catch (error) {
//         throw new Error(`Error fetching car model details: ${error.message}`);
//       }
//     }

//     async createOrUpdateVehicle(email: string, dto: CreateVehicleDto) {
//       const user = await this.userRepository.findOne({
//         where: { email },
//         relations: ['vehicle'],
//       });

//       if (!user) {
//         throw new NotFoundException(`User with email ${email} not found`);
//       }

//       if (!user.isRider) {
//         throw new Error('Only riders can create or update a vehicle');
//       }

//       // ✅ Immediately delete old vehicle if exists
//       if (user.vehicle) {
//         await this.vehicleRepository.delete(user.vehicle.id);
//       }

//       // 🚨 Check for license plate conflict
//       const existingVehicle = await this.vehicleRepository.findOne({
//         where: { licensePlate: dto.licensePlate },
//       });

//       if (existingVehicle) {
//         throw new ConflictException('This plate number is already in use');
//       }

//       // 🚗 Create new vehicle
//       const vehicle = this.vehicleRepository.create(dto);
//       vehicle.user = user;

//       await this.vehicleRepository.save(vehicle);

//       // 👤 Update user relation
//       user.vehicle = vehicle;
//       await this.userRepository.save(user);

//       return user;
//     }

//     async getVehicleByUser(email: string) {
//       const user = await this.userRepository.findOne({ where: { email }, relations: ['vehicle'] });

//       if (!user) {
//         throw new NotFoundException(`User with email ${email} not found`);
//       }

//       return user.vehicle;
//     }

// async createProfileImage(file: Express.Multer.File, user: User) {
//   if (!file) throw new BadRequestException('Image file is required');

//   const fileUrl = await this.uploadFileToLinode(file);

//   const existing = await this.profileImageRepository.findOne({
//     where: { user: { id: user.id } },
//     relations: ['user'],
//   });

//   let profileImage;

//   if (existing) {
//     existing.name = file.originalname;
//     existing.url = fileUrl;
//     existing.ext = path.extname(file.originalname).slice(1);
//     profileImage = await this.profileImageRepository.save(existing);
//   } else {
//     profileImage = this.profileImageRepository.create({
//       name: file.originalname,
//       url: fileUrl,
//       ext: path.extname(file.originalname).slice(1),
//       user: user,
//     });
//     await this.profileImageRepository.save(profileImage);
//   }

//   user.Profile_img = profileImage;
//   await this.userRepository.save(user);

//   return { message: 'Profile image uploaded successfully', fileUrl };
// }

// async createPlateNumImage(file: Express.Multer.File, user: User) {
//   if (!file) throw new BadRequestException('Image file is required');

//   const fileUrl = await this.uploadFileToLinode(file);

//   const existing = await this.plateImageRepository.findOne({
//     where: { user: { id: user.id } },
//     relations: ['user'],
//   });

//   let plateImage;

//   if (existing) {
//     existing.name = file.originalname;
//     existing.url = fileUrl;
//     existing.ext = path.extname(file.originalname).slice(1);
//     plateImage = await this.plateImageRepository.save(existing);
//   } else {
//     plateImage = this.plateImageRepository.create({
//       name: file.originalname,
//       url: fileUrl,
//       ext: path.extname(file.originalname).slice(1),
//       user: user,
//     });
//     await this.plateImageRepository.save(plateImage);
//   }

//   // Optional: assign to user if user has a plateNum relation
//   user.plateNum_img = plateImage;
//   await this.userRepository.save(user);

//   return { message: 'Plate number image uploaded successfully', fileUrl };
// }

// async createVehicleImage(file: Express.Multer.File, user: User) {
//   if (!file) throw new BadRequestException('Image file is required');

//   const fileUrl = await this.uploadFileToLinode(file);

//   const existing = await this.vehicleRegImageRepository.findOne({
//     where: { user: { id: user.id } },
//     relations: ['user'],
//   });

//   let vehicleImage;

//   if (existing) {
//     existing.name = file.originalname;
//     existing.url = fileUrl;
//     existing.ext = path.extname(file.originalname).slice(1);
//     vehicleImage = await this.vehicleRegImageRepository.save(existing);
//   } else {
//     vehicleImage = this.vehicleRegImageRepository.create({
//       name: file.originalname,
//       url: fileUrl,
//       ext: path.extname(file.originalname).slice(1),
//       user: user,
//     });
//     await this.vehicleRegImageRepository.save(vehicleImage);
//   }

//   user.vehicle_reg_image = vehicleImage;
//   await this.userRepository.save(user);

//   return { message: 'Vehicle registration image uploaded successfully', fileUrl };
// }
// async createLicenseImage(file: Express.Multer.File, user: User) {
//   if (!file) throw new BadRequestException('Image file is required');

//   const fileUrl = await this.uploadFileToLinode(file);

//   const existing = await this.licenseImageRepository.findOne({
//     where: { user: { id: user.id } },
//     relations: ['user'],
//   });

//   let licenseImage;

//   if (existing) {
//     existing.name = file.originalname;
//     existing.url = fileUrl;
//     existing.ext = path.extname(file.originalname).slice(1);
//     licenseImage = await this.licenseImageRepository.save(existing);
//   } else {
//     licenseImage = this.licenseImageRepository.create({
//       name: file.originalname,
//       url: fileUrl,
//       ext: path.extname(file.originalname).slice(1),
//       user: user,
//     });
//     await this.licenseImageRepository.save(licenseImage);
//   }

//   user.licenseImg = licenseImage;
//   await this.userRepository.save(user);

//   return { message: 'License image uploaded successfully', fileUrl };
// }
//     async deleteVehicle(email: string) {
//       const user = await this.userRepository.findOne({ where: { email }, relations: ['vehicle'] });

//       if (!user) {
//         throw new NotFoundException(`User with email ${email} not found`);
//       }

//       if (!user.vehicle) {
//         throw new NotFoundException('Vehicle not found');
//       }

//       await this.vehicleRepository.delete(user.vehicle.id);
//       return { message: 'Vehicle deleted successfully' };
//     }

// }
/* eslint-disable prettier/prettier */
import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Like, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { HttpService } from '@nestjs/axios';
import { User, UserRole } from './entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  CreateAuthDto,
  CreateAuthDtoDriver,
  LoginAuthDto,
} from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { DiverLicense } from './entities/license.entity';
import { Nin, RiderType } from './entities/nin';
import axios from 'axios';

import { Vehicle } from './entities/vehicle.entity';
import { CreateVehicleDto } from './dto/vehicle.dto';
import * as AWS from 'aws-sdk';
import { ProfileImage } from './entities/profile.entity';
import * as path from 'path';
import { plateNum } from './entities/plateNum.entity';
import { LicenseImg } from './entities/licenseImg.entity';
import { VehicleReg } from './entities/VehicleReg.entity';
import { SignupDriverDto } from './dto/signup-driver.dto';
import { MailService } from 'src/mail/mail.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly apiUrl: string;
  private s3: AWS.S3 | null;
  private bucketName: string | null;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(DiverLicense)
    private licenseRepository: Repository<DiverLicense>,
    @InjectRepository(Nin)
    private ninRepository: Repository<Nin>,
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
    @InjectRepository(ProfileImage)
    private readonly profileImageRepository: Repository<ProfileImage>,
    @InjectRepository(plateNum)
    private readonly plateImageRepository: Repository<plateNum>,
    @InjectRepository(LicenseImg)
    private readonly licenseImageRepository: Repository<LicenseImg>,
    @InjectRepository(VehicleReg)
    private readonly vehicleRegImageRepository: Repository<VehicleReg>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly mailService: MailService,
  ) {
    this.apiUrl = this.configService.get<string>('API_URL');

    const accessKeyId = this.configService.get<string>('LINODE_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'LINODE_SECRET_ACCESS_KEY',
    );
    const endpoint = this.configService.get<string>('LINODE_ENDPOINT');
    const region = this.configService.get<string>('LINODE_REGION');
    const bucketName = this.configService.get<string>('LINODE_BUCKET_NAME');

    // Initialize S3 only if all credentials are provided
    if (accessKeyId && secretAccessKey && endpoint && region && bucketName) {
      this.s3 = new AWS.S3({
        endpoint: endpoint,
        region: region,
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        signatureVersion: 'v4',
        s3ForcePathStyle: true, // Required for Linode Object Storage
        credentials: new AWS.Credentials(accessKeyId, secretAccessKey), // Explicitly set credentials to prevent metadata service lookup
      });
      this.bucketName = bucketName;
    } else {
      // Log warning but don't throw - allows app to start without file upload functionality
      const missing = [
        !accessKeyId && 'LINODE_ACCESS_KEY_ID',
        !secretAccessKey && 'LINODE_SECRET_ACCESS_KEY',
        !endpoint && 'LINODE_ENDPOINT',
        !region && 'LINODE_REGION',
        !bucketName && 'LINODE_BUCKET_NAME',
      ].filter(Boolean);
      console.warn(
        `⚠️  Linode Object Storage not configured. Missing: ${missing.join(', ')}. File upload features will be disabled.`,
      );
      this.s3 = null;
      this.bucketName = null;
    }
  }

  // ---------- OTP helpers ----------
  private generateFiveDigitOtp(): string {
    const n = Math.floor(10000 + Math.random() * 90000);
    return String(n);
  }

  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  private async setEmailVerificationOtp(user: User): Promise<string> {
    const otp = this.generateFiveDigitOtp();
    user.emailVerificationOtpHash = this.hashOtp(otp);
    user.emailVerificationOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await this.userRepository.save(user);
    return otp;
  }

  private async setPasswordResetOtp(user: User): Promise<string> {
    const otp = this.generateFiveDigitOtp();
    user.passwordResetOtpHash = this.hashOtp(otp);
    user.passwordResetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.userRepository.save(user);
    return otp;
  }

  // ---------- Token issuance (role claim in ACCESS) ----------
  private computeRoleForUser(u: User): UserRole {
    if (u.role === UserRole.ADMIN) return UserRole.ADMIN;
    return u.role === UserRole.RIDER ? UserRole.RIDER : UserRole.CUSTOMER;
  }

  async issueTokensForUser(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    user: Partial<User>;
  }> {
    const role = this.computeRoleForUser(user);
    const payload = { sub: user.id, email: user.email, role }; // role inside access token

    const accessToken = await this.jwtService.signAsync(payload, {
      // No expiration - token will not expire
      secret: this.configService.get<string>('ACCESS_TOKEN'),
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        // No expiration - token will not expire
        secret: this.configService.get<string>('REFRESH_TOKEN'),
      },
    );

    const { password: _p, ...safe } = user;
    return { accessToken, refreshToken, user: safe };
  }

  async createUser(createUserDto: CreateAuthDto): Promise<User> {
    const { email, phoneNumber, password, firstName, lastName, role } =
      createUserDto;

    const existingUser = await this.userRepository.findOne({
      where: [{ email }, { phoneNumber }],
    });
    if (existingUser) {
      throw new ConflictException(
        'A user with this email or phone number already exists.',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = this.userRepository.create({
      email,
      phoneNumber,
      password: hashedPassword,
      firstName,
      lastName,
      role,
    });
    const saved = await this.userRepository.save(user);
    const otp = await this.setEmailVerificationOtp(saved);
    await this.mailService.sendOtpEmail(
      saved.email,
      'Your verification code',
      otp,
    );
    return saved;
  }
  async createDriver(createUserDto: SignupDriverDto): Promise<User> {
    const {
      email,
      phoneNumber,
      password,
      firstName,
      lastName,

      driveCountry,
      driveCity,
    } = createUserDto;

    const existingUser = await this.userRepository.findOne({
      where: [{ email }, { phoneNumber }],
    });
    if (existingUser) {
      throw new ConflictException(
        'A user with this email or phone number already exists.',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = this.userRepository.create({
      email,
      phoneNumber,
      password: hashedPassword,
      firstName,
      lastName,
      role: UserRole.RIDER,
    });
    const saved = await this.userRepository.save(user);
    const otp = await this.setEmailVerificationOtp(saved);

    await this.mailService.sendOtpEmail(
      saved.email,
      'Your verification code', // TODO: change to a more descriptive subject
      otp,
    );
    return saved;
  }

  async login(loginAuthDto: LoginAuthDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: Partial<User>;
  }> {
    const { email, password } = loginAuthDto;

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid email or password');

    // Check if account is deleted
    if (user.deletedAt) {
      throw new UnauthorizedException(
        'This account has been deleted. Please contact admin for account restoration.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      throw new UnauthorizedException('Invalid email or password');

    if (!user.isEmailVerified) {
      const otp = await this.setEmailVerificationOtp(user);
      await this.mailService.sendOtpEmail(
        user.email,
        'Verify your account',
        otp,
      );
      throw new UnauthorizedException(
        'Email not verified. A verification code has been sent to your email.',
      );
    }

    return this.issueTokensForUser(user);
  }

  async verifyEmailOtp(otp: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: Partial<User>;
  }> {
    const incoming = this.hashOtp(otp);
    const user = await this.userRepository.findOne({
      where: { emailVerificationOtpHash: incoming },
    });
    if (!user) throw new NotFoundException('Invalid verification code');
    if (!user.emailVerificationOtpExpiresAt)
      throw new BadRequestException('No active verification code');
    if (user.emailVerificationOtpExpiresAt.getTime() < Date.now())
      throw new BadRequestException('Verification code expired');
    user.isEmailVerified = true;
    user.emailVerificationOtpHash = null;
    user.emailVerificationOtpExpiresAt = null;
    await this.userRepository.save(user);
    return this.issueTokensForUser(user);
  }

  async resendEmailOtp(email: string): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { email } });
      console.log('user', user);

      if (!user) throw new NotFoundException('User not found');
      if (user.isEmailVerified)
        throw new BadRequestException('Email already verified');
      const otp = await this.setEmailVerificationOtp(user);
      await this.mailService.sendOtpEmail(
        user.email,
        'Your verification code',
        otp,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // ---------- Password reset ----------
  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    const otp = await this.setPasswordResetOtp(user);
    await this.mailService.sendOtpEmail(
      user.email,
      'Your password reset code',
      otp,
    );
  }

  async resendForgotPasswordOtp(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    const otp = await this.setPasswordResetOtp(user);
    await this.mailService.sendOtpEmail(
      user.email,
      'Your password reset code',
      otp,
    );
  }

  async ensureDefaultAdminAccount(): Promise<void> {
    const email =
      this.configService.get<string>('DEFAULT_ADMIN_EMAIL') ||
      'admin@errand.com';
    const password =
      this.configService.get<string>('DEFAULT_ADMIN_PASSWORD') ||
      '!Qwertyuiop112';
    const phone =
      this.configService.get<string>('DEFAULT_ADMIN_PHONE') || '0000000000';

    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) return;

    const hashed = await bcrypt.hash(password, 10);
    const admin = this.userRepository.create({
      email,
      phoneNumber: phone,
      password: hashed,
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      isEmailVerified: true,
    });
    await this.userRepository.save(admin);
  }

  async resetPassword(
    email: string,
    otp: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt)
      throw new BadRequestException('No active reset code');
    if (user.passwordResetOtpExpiresAt.getTime() < Date.now())
      throw new BadRequestException('Reset code expired');
    const incoming = this.hashOtp(otp);
    if (incoming !== user.passwordResetOtpHash)
      throw new BadRequestException('Invalid reset code');
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpiresAt = null;
    user.password = await bcrypt.hash(newPassword, 10);
    await this.userRepository.save(user);
  }

  // ---------- Users ----------
  async findAll(): Promise<User[]> {
    const users = await this.userRepository.find({
      relations: [
        'card',
        'driverLicense',
        'nin',
        'vehicle',
        'vehicle_reg_image',
        'Profile_img',
        'plateNum_img',
        'licenseImg',
      ],
    });

    if (users.length === 0) throw new NotFoundException('No users found.');
    return users;
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: [
        'card',
        'driverLicense',
        'nin',
        'vehicle',
        'vehicle_reg_image',
        'Profile_img',
        'plateNum_img',
        'licenseImg',
      ],
    });

    if (!user) throw new NotFoundException(`User with ID ${id} not found.`);
    return user;
  }

  async findOneByEmail(email: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['card', 'driverLicense', 'nin', 'vehicle'],
    });
    if (!user)
      throw new NotFoundException(`User with email ${email} not found.`);
    return user;
  }

  async update(id: string, updateAuthDto: UpdateAuthDto): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, updateAuthDto);
    return this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }

  async countUsers(): Promise<number> {
    try {
      return await this.userRepository.count();
    } catch (error) {
      throw error;
    }
  }

  async deleteAccount(
    userId: string,
    reason: string,
    additionalNotes?: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Admin accounts cannot be deleted');
    }

    if (user.deletedAt) {
      throw new BadRequestException('Account is already deleted');
    }

    // Soft delete: set deletedAt, deletedReason, and deletedBy
    user.deletedAt = new Date();
    user.deletedReason = additionalNotes
      ? `${reason} | Additional Notes: ${additionalNotes}`
      : reason;
    user.deletedBy = userId; // User deleted their own account
    user.isOnline = false; // Set user offline

    await this.userRepository.save(user);

    return {
      success: true,
      message:
        'Account deleted successfully. You can request account restoration from admin.',
    };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<string> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid)
      throw new BadRequestException('Incorrect old password');

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await this.userRepository.save(user);

    return 'Password changed successfully';
  }

  async getNinDetails(nin: string) {
    try {
      const response = await this.httpService.axiosRef.get(
        `https://api.dikript.com/dikript/test/api/v1/getnin?nin=${nin}`,
        { headers: { 'x-api-key': process.env.NIN_VER } },
      );
      if (response.data?.status === true && response.data?.data) {
        return response.data.data;
      } else {
        throw new BadRequestException(
          response.data?.error?.message || 'Failed to fetch NIN details',
        );
      }
    } catch (error) {
      const msg =
        (error && (error.message || error.response?.data?.message)) ||
        'Error retrieving NIN details. Please try again later.';
      throw new BadRequestException(msg);
    }
  }

  async getDriverLicenseDetails(licenseNo: string) {
    try {
      const response = await this.httpService.axiosRef.get(
        `https://api.dikript.com/dikript/test/api/v1/getfrsc?frsc=${licenseNo}`,
        { headers: { 'x-api-key': process.env.BVN_VER } },
      );
      if (response.data?.status === true && response.data?.data) {
        return response.data.data;
      } else {
        throw new BadRequestException(
          response.data?.error?.message ||
            'Failed to fetch Driver License details',
        );
      }
    } catch (error) {
      const msg =
        (error && (error.message || error.response?.data?.message)) ||
        'Error retrieving Driver License details. Please try again later.';
      throw new BadRequestException(msg);
    }
  }

  async getDrivers() {
    const drivers = await this.userRepository.find({
      where: { role: UserRole.RIDER },
      relations: [
        'driverLicense',
        'nin',
        'vehicle',
        'vehicle_reg_image',
        'Profile_img',
        'plateNum_img',
        'licenseImg',
      ],
    });
    return drivers;
  }

  async getCarBrands(): Promise<any> {
    try {
      const response = await axios.get(
        'https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=json',
      );
      return response.data.Results;
    } catch (error) {
      throw new Error(`Error fetching car brands: ${error.message}`);
    }
  }

  async getCarModels(make: string): Promise<any> {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/${make}?format=json`;
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      throw new Error(`Error fetching car models: ${error.message}`);
    }
  }

  async getCarModelDetails(make: string, model: string): Promise<any> {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/${make}?format=json`;
    try {
      const response = await axios.get(url);
      const filteredModels = response.data.Results.filter(
        (m: any) => m.Model_Name.toLowerCase() === model.toLowerCase(),
      );
      return { count: filteredModels.length, results: filteredModels };
    } catch (error) {
      throw new Error(`Error fetching car model details: ${error.message}`);
    }
  }

  // ---------- Vehicle (by JWT identity) ----------
  async createOrUpdateVehicleByUserId(userId: string, dto: CreateVehicleDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['vehicle'],
    });
    if (!user) throw new NotFoundException(`User not found`);
    if (user.role === UserRole.RIDER)
      throw new Error('Only riders can create or update a vehicle');

    if (user.vehicle) await this.vehicleRepository.delete(user.vehicle.id);

    const existingVehicle = await this.vehicleRepository.findOne({
      where: { licensePlate: dto.licensePlate },
    });
    if (existingVehicle)
      throw new ConflictException('This plate number is already in use');

    const vehicle = this.vehicleRepository.create({ ...dto, user });
    await this.vehicleRepository.save(vehicle);

    user.vehicle = vehicle;
    await this.userRepository.save(user);

    return user;
  }

  async getVehicleByUserId(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['vehicle'],
    });
    if (!user) throw new NotFoundException(`User not found`);
    return user.vehicle;
  }

  async deleteVehicleByUserId(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['vehicle'],
    });
    if (!user) throw new NotFoundException(`User not found`);
    if (!user.vehicle) throw new NotFoundException('Vehicle not found');
    await this.vehicleRepository.delete(user.vehicle.id);
    return { message: 'Vehicle deleted successfully' };
  }

  // ---------- File uploads ----------
  async uploadFileToLinode(file: Express.Multer.File): Promise<string> {
    if (!this.s3 || !this.bucketName) {
      throw new BadRequestException(
        'Linode Object Storage is not configured. Please set LINODE_ENDPOINT, LINODE_REGION, LINODE_ACCESS_KEY_ID, LINODE_SECRET_ACCESS_KEY, and LINODE_BUCKET_NAME environment variables.',
      );
    }

    const params = {
      Bucket: this.bucketName,
      Key: `${Date.now()}-${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
    };

    try {
      const uploadResult = await this.s3.upload(params).promise();
      return uploadResult.Location;
    } catch (error) {
      throw new BadRequestException(
        'Error uploading file to Linode Object Storage',
        error,
      );
    }
  }

  async createProfileImage(file: Express.Multer.File, user: User) {
    if (!file) throw new BadRequestException('Image file is required');
    const fileUrl = await this.uploadFileToLinode(file);

    const existing = await this.profileImageRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    let profileImage;
    if (existing) {
      existing.name = file.originalname;
      existing.url = fileUrl;
      existing.ext = path.extname(file.originalname).slice(1);
      profileImage = await this.profileImageRepository.save(existing);
    } else {
      profileImage = this.profileImageRepository.create({
        name: file.originalname,
        url: fileUrl,
        ext: path.extname(file.originalname).slice(1),
        user: user,
      });
      await this.profileImageRepository.save(profileImage);
    }

    user.profileImage = profileImage;
    await this.userRepository.save(user);

    return { message: 'Profile image uploaded successfully', fileUrl };
  }

  async createPlateNumImage(file: Express.Multer.File, user: User) {
    if (!file) throw new BadRequestException('Image file is required');
    const fileUrl = await this.uploadFileToLinode(file);

    const existing = await this.plateImageRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    let plateImage;
    if (existing) {
      existing.name = file.originalname;
      existing.url = fileUrl;
      existing.ext = path.extname(file.originalname).slice(1);
      plateImage = await this.plateImageRepository.save(existing);
    } else {
      plateImage = this.plateImageRepository.create({
        name: file.originalname,
        url: fileUrl,
        ext: path.extname(file.originalname).slice(1),
        user: user,
      });
      await this.plateImageRepository.save(plateImage);
    }

    user.plateNumberImage = plateImage;
    await this.userRepository.save(user);

    return { message: 'Plate number image uploaded successfully', fileUrl };
  }

  async createVehicleImage(file: Express.Multer.File, user: User) {
    if (!file) throw new BadRequestException('Image file is required');
    const fileUrl = await this.uploadFileToLinode(file);

    const existing = await this.vehicleRegImageRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    let vehicleImage;
    if (existing) {
      existing.name = file.originalname;
      existing.url = fileUrl;
      existing.ext = path.extname(file.originalname).slice(1);
      vehicleImage = await this.vehicleRegImageRepository.save(existing);
    } else {
      vehicleImage = this.vehicleRegImageRepository.create({
        name: file.originalname,
        url: fileUrl,
        ext: path.extname(file.originalname).slice(1),
        user: user,
      });
      await this.vehicleRegImageRepository.save(vehicleImage);
    }

    user.vehicleRegImage = vehicleImage;
    await this.userRepository.save(user);

    return {
      message: 'Vehicle registration image uploaded successfully',
      fileUrl,
    };
  }

  async createLicenseImage(file: Express.Multer.File, user: User) {
    if (!file) throw new BadRequestException('Image file is required');
    const fileUrl = await this.uploadFileToLinode(file);

    const existing = await this.licenseImageRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    let licenseImage;
    if (existing) {
      existing.name = file.originalname;
      existing.url = fileUrl;
      existing.ext = path.extname(file.originalname).slice(1);
      licenseImage = await this.licenseImageRepository.save(existing);
    } else {
      licenseImage = this.licenseImageRepository.create({
        name: file.originalname,
        url: fileUrl,
        ext: path.extname(file.originalname).slice(1),
        user: user,
      });
      await this.licenseImageRepository.save(licenseImage);
    }

    user.licenseImage = licenseImage;
    await this.userRepository.save(user);

    return { message: 'License image uploaded successfully', fileUrl };
  }
}
